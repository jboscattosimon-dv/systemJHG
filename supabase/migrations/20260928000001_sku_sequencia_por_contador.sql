-- ================================================================
--  SKU: contador próprio por loja + import passa a poder trazer SKU
-- ================================================================
-- Problema: o SKU automático (gerar_sku_automatico) calculava o
-- próximo número como "MAX(sku::INTEGER) já usado + 1". Isso funciona
-- bem enquanto todo SKU vem dessa mesma sequência — mas quebra assim
-- que importamos produtos com um código de outro sistema (ex.: código
-- da nota fiscal do fornecedor, tipo "0322935"), porque esse código
-- também é só dígitos e passa a virar o "maior SKU" da loja. Todo
-- produto cadastrado manualmente depois pularia pra um número gigante
-- e fora de sequência, em vez de continuar de onde a loja já estava.
--
-- Fix: a sequência deixa de ser calculada a partir dos dados (nunca
-- mais faz MAX(sku) em produtos) e passa a ser um contador próprio em
-- empresas.proximo_sku_sequencial, incrementado atomicamente a cada
-- produto novo sem SKU informado. Semeamos esse contador AGORA, a
-- partir do maior SKU numérico já em uso — então esta migração precisa
-- rodar ANTES de importar a planilha com os códigos da nota fiscal,
-- senão semeia com o valor errado (já contaminado pelo código grande).
--
-- Também criamos um índice único (empresa_id, sku) — trava em nível
-- de banco pra garantir que nenhum código (importado ou gerado) nunca
-- se repita, mesmo sob concorrência.

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS proximo_sku_sequencial INTEGER;

UPDATE public.empresas e
SET proximo_sku_sequencial = COALESCE(
  (SELECT MAX(p.sku::INTEGER) FROM public.produtos p WHERE p.empresa_id = e.id AND p.sku ~ '^[0-9]+$'),
  0
) + 1
WHERE e.proximo_sku_sequencial IS NULL;

CREATE OR REPLACE FUNCTION public.gerar_sku_automatico()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_proximo INTEGER;
BEGIN
  IF NEW.sku IS NULL OR trim(NEW.sku) = '' THEN
    UPDATE public.empresas
    SET proximo_sku_sequencial = COALESCE(proximo_sku_sequencial, 1) + 1
    WHERE id = NEW.empresa_id
    RETURNING proximo_sku_sequencial - 1 INTO v_proximo;
    NEW.sku := v_proximo::TEXT;
  END IF;
  RETURN NEW;
END;
$$;

-- Nunca deixa dois produtos da mesma loja com o mesmo SKU, seja ele
-- gerado automaticamente ou importado de uma planilha.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_sku_unico_por_empresa
  ON public.produtos (empresa_id, sku)
  WHERE sku IS NOT NULL;

-- importar_produtos passa a aceitar "sku" em cada item. Quando vier
-- preenchido, vira o SKU do produto (e passa a ser a chave de
-- correspondência pra saber se é criação ou atualização — antes era
-- só pelo nome, o que juntava errado produtos diferentes com nome
-- igual e código diferente, tipo várias "Calça N460" da mesma nota).
-- Sem SKU informado, continua tudo como era: casa por nome, e o
-- trigger acima gera o SKU sozinho. Mesma assinatura (p_produtos
-- JSONB) e mesmo RETURNS TABLE — CREATE OR REPLACE cobre a troca.
CREATE OR REPLACE FUNCTION public.importar_produtos(p_produtos JSONB)
RETURNS TABLE (nome TEXT, acao TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa     UUID := public.minha_empresa();
  v_item        JSONB;
  v_produto_id  UUID;
  v_tamanho     JSONB;
  v_acao        TEXT;
  v_sku         TEXT;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_produtos)
  LOOP
    v_sku := NULLIF(trim(v_item->>'sku'), '');

    IF v_sku IS NOT NULL THEN
      SELECT id INTO v_produto_id FROM public.produtos
      WHERE empresa_id = v_empresa AND sku = v_sku;
    ELSE
      SELECT id INTO v_produto_id FROM public.produtos
      WHERE empresa_id = v_empresa AND lower(trim(produtos.nome)) = lower(trim(v_item->>'nome'));
    END IF;

    IF v_produto_id IS NULL THEN
      INSERT INTO public.produtos (nome, sku, categoria, preco_custo, preco_venda, preco_venda_prazo, estoque_atual, empresa_id)
      VALUES (
        trim(v_item->>'nome'), v_sku, 'roupas',
        COALESCE((v_item->>'preco_custo')::NUMERIC, 0),
        COALESCE((v_item->>'preco_venda')::NUMERIC, 0),
        NULLIF(v_item->>'preco_venda_prazo', '')::NUMERIC,
        COALESCE((v_item->>'estoque_total')::INTEGER, 0),
        v_empresa
      )
      RETURNING id INTO v_produto_id;
      v_acao := 'criado';
    ELSE
      UPDATE public.produtos SET
        preco_custo = COALESCE((v_item->>'preco_custo')::NUMERIC, preco_custo),
        preco_venda = COALESCE((v_item->>'preco_venda')::NUMERIC, preco_venda),
        preco_venda_prazo = NULLIF(v_item->>'preco_venda_prazo', '')::NUMERIC,
        sku = COALESCE(v_sku, sku)
      WHERE id = v_produto_id;
      v_acao := 'atualizado';
    END IF;

    DELETE FROM public.produto_tamanhos WHERE produto_id = v_produto_id;

    FOR v_tamanho IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'tamanhos', '[]'::jsonb))
    LOOP
      INSERT INTO public.produto_tamanhos (produto_id, tamanho, quantidade, empresa_id)
      VALUES (v_produto_id, v_tamanho->>'tamanho', COALESCE((v_tamanho->>'quantidade')::INTEGER, 0), v_empresa);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM public.produto_tamanhos WHERE produto_id = v_produto_id) THEN
      UPDATE public.produtos SET estoque_atual = COALESCE((v_item->>'estoque_total')::INTEGER, estoque_atual) WHERE id = v_produto_id;
    END IF;

    nome := trim(v_item->>'nome'); acao := v_acao;
    RETURN NEXT;
  END LOOP;
END;
$$;
