-- ================================================================
--  Estoque por tamanho + preço a prazo nos produtos
-- ================================================================
-- produto_tamanhos: quebra do estoque de um produto por tamanho
-- (tamanho livre — P/M/G, numeração de calçado, o que a loja usar).
-- produtos.estoque_atual continua sendo o total (é o que PDV,
-- Condicional e o alerta de estoque mínimo já usam) — só passa a
-- ser recalculado automaticamente a partir da soma dos tamanhos
-- quando o produto tiver pelo menos uma linha em produto_tamanhos.
-- Produto sem tamanho cadastrado continua com estoque_atual editado
-- direto, exatamente como hoje.

CREATE TABLE IF NOT EXISTS public.produto_tamanhos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id  UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tamanho     TEXT NOT NULL,
  quantidade  INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  empresa_id  UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  UNIQUE (produto_id, tamanho)
);

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS preco_venda_prazo NUMERIC(10,2);

ALTER TABLE public.produto_tamanhos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolada" ON public.produto_tamanhos;
CREATE POLICY "empresa_isolada" ON public.produto_tamanhos FOR ALL TO authenticated
  USING (empresa_id = public.minha_empresa()) WITH CHECK (empresa_id = public.minha_empresa());

CREATE OR REPLACE FUNCTION public.recalcular_estoque_produto()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_produto_id UUID := COALESCE(NEW.produto_id, OLD.produto_id);
BEGIN
  UPDATE public.produtos
  SET estoque_atual = (SELECT COALESCE(SUM(quantidade), 0) FROM public.produto_tamanhos WHERE produto_id = v_produto_id)
  WHERE id = v_produto_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalcular_estoque_produto ON public.produto_tamanhos;
CREATE TRIGGER trg_recalcular_estoque_produto
  AFTER INSERT OR UPDATE OR DELETE ON public.produto_tamanhos
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_estoque_produto();

-- ── importar_produtos ───────────────────────────────────────────
-- Upsert em lote por nome (case-insensitive): existe -> atualiza,
-- não existe -> cria. Sempre substitui a lista de tamanhos do
-- produto pela enviada (lista vazia = produto sem controle por
-- tamanho, usa p_estoque_total direto).
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
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_produtos)
  LOOP
    SELECT id INTO v_produto_id FROM public.produtos
    WHERE empresa_id = v_empresa AND lower(trim(produtos.nome)) = lower(trim(v_item->>'nome'));

    IF v_produto_id IS NULL THEN
      INSERT INTO public.produtos (nome, categoria, preco_custo, preco_venda, preco_venda_prazo, estoque_atual, empresa_id)
      VALUES (
        trim(v_item->>'nome'), 'outros',
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
        preco_venda_prazo = NULLIF(v_item->>'preco_venda_prazo', '')::NUMERIC
      WHERE id = v_produto_id;
      v_acao := 'atualizado';
    END IF;

    DELETE FROM public.produto_tamanhos WHERE produto_id = v_produto_id;

    FOR v_tamanho IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'tamanhos', '[]'::jsonb))
    LOOP
      INSERT INTO public.produto_tamanhos (produto_id, tamanho, quantidade, empresa_id)
      VALUES (v_produto_id, v_tamanho->>'tamanho', COALESCE((v_tamanho->>'quantidade')::INTEGER, 0), v_empresa);
    END LOOP;

    -- Sem tamanho nenhum: usa o total informado direto (o trigger só
    -- recalcula quando existe alguma linha em produto_tamanhos).
    IF NOT EXISTS (SELECT 1 FROM public.produto_tamanhos WHERE produto_id = v_produto_id) THEN
      UPDATE public.produtos SET estoque_atual = COALESCE((v_item->>'estoque_total')::INTEGER, estoque_atual) WHERE id = v_produto_id;
    END IF;

    nome := trim(v_item->>'nome'); acao := v_acao;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ── fechar_condicional: usa preço a prazo quando o pagamento é credito ──
CREATE OR REPLACE FUNCTION public.fechar_condicional(
  p_condicional_id  UUID,
  p_decisoes        JSONB,
  p_forma_pagamento TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa      UUID := public.minha_empresa();
  v_cliente_id   UUID;
  v_cliente_nome TEXT;
  v_decisao      JSONB;
  v_item_id      UUID;
  v_status       TEXT;
  v_itens_venda  JSONB := '[]'::JSONB;
  v_venda_id     UUID := NULL;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  SELECT cliente_id INTO v_cliente_id
  FROM public.condicionais
  WHERE id = p_condicional_id AND empresa_id = v_empresa AND status = 'aberto';

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Condicional não encontrado, de outra loja, ou já fechado.';
  END IF;

  SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = v_cliente_id;

  FOR v_decisao IN SELECT * FROM jsonb_array_elements(p_decisoes)
  LOOP
    v_item_id := (v_decisao->>'item_id')::UUID;
    v_status  := v_decisao->>'status';

    IF v_status NOT IN ('vendido', 'devolvido') THEN
      RAISE EXCEPTION 'Status de item inválido: %', v_status;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.itens_condicional WHERE id = v_item_id AND condicional_id = p_condicional_id) THEN
      RAISE EXCEPTION 'Item não pertence a esse condicional.';
    END IF;

    UPDATE public.itens_condicional SET status = v_status WHERE id = v_item_id;

    IF v_status = 'vendido' THEN
      SELECT v_itens_venda || jsonb_build_object(
        'tipo', 'produto',
        'referencia_id', ic.produto_id,
        'nome', ic.nome,
        'quantidade', ic.quantidade,
        'preco_unitario', CASE WHEN p_forma_pagamento = 'credito' THEN COALESCE(p.preco_venda_prazo, ic.preco_unitario) ELSE ic.preco_unitario END,
        'profissional_id', NULL
      ) INTO v_itens_venda
      FROM public.itens_condicional ic
      JOIN public.produtos p ON p.id = ic.produto_id
      WHERE ic.id = v_item_id;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.itens_condicional WHERE condicional_id = p_condicional_id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Todos os itens precisam de uma decisão (vendido ou devolvido) antes de fechar.';
  END IF;

  IF jsonb_array_length(v_itens_venda) > 0 THEN
    IF p_forma_pagamento IS NULL THEN
      RAISE EXCEPTION 'Informe a forma de pagamento para os itens vendidos.';
    END IF;
    v_venda_id := public.finalizar_venda(v_cliente_nome, v_cliente_id, p_forma_pagamento, v_itens_venda);
  END IF;

  UPDATE public.condicionais
  SET status = 'fechado', fechado_em = NOW(), venda_id = v_venda_id
  WHERE id = p_condicional_id;

  RETURN v_venda_id;
END;
$$;
