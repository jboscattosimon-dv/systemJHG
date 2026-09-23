-- ================================================================
--  Entrada de mercadoria — cálculo de preço a partir do custo
-- ================================================================
-- Tela simples de "lançamento de entrada": a loja informa quanto
-- pagou por peça, o frete e outras despesas da compra toda, e uma
-- margem — o sistema rateia frete+despesas proporcionalmente ao
-- valor pago de cada item, soma no custo unitário e sugere o preço
-- à vista e a prazo a partir da margem. Não é uma nota fiscal de
-- entrada (sem impostos, sem nota do fornecedor) — só o cálculo e o
-- lançamento em estoque.
--
-- Cada item pode ser um produto existente (produto_id informado —
-- atualiza custo/preço e soma no estoque) ou um produto novo (nome
-- informado — cria já com o custo/preço calculado). Produto com
-- tamanho cadastrado tem o preço atualizado normalmente, mas o
-- estoque NÃO é somado aqui (ambíguo pra qual tamanho é a entrada —
-- o trigger de produto_tamanhos é quem manda no total dele; ajuste
-- via tela de Produtos).

CREATE OR REPLACE FUNCTION public.registrar_entrada_produtos(
  p_itens        JSONB,
  p_frete        NUMERIC DEFAULT 0,
  p_despesas     NUMERIC DEFAULT 0,
  p_margem_vista NUMERIC DEFAULT 0,
  p_margem_prazo NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  produto_id        UUID,
  nome              TEXT,
  quantidade        INTEGER,
  custo_unitario    NUMERIC,
  preco_venda       NUMERIC,
  preco_venda_prazo NUMERIC,
  tem_tamanhos      BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa        UUID := public.minha_empresa();
  v_item           JSONB;
  v_total_pago     NUMERIC := 0;
  v_proporcao      NUMERIC;
  v_custo_unitario NUMERIC;
  v_preco_vista    NUMERIC;
  v_preco_prazo    NUMERIC;
  v_produto_id     UUID;
  v_qtd            INTEGER;
  v_valor_pago     NUMERIC;
  v_tem_tamanhos   BOOLEAN;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um item na entrada.';
  END IF;

  IF p_margem_vista IS NULL THEN
    RAISE EXCEPTION 'Informe a margem à vista.';
  END IF;

  SELECT COALESCE(SUM((i->>'valor_pago_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total_pago
  FROM jsonb_array_elements(p_itens) i;

  IF v_total_pago <= 0 THEN
    RAISE EXCEPTION 'Informe o valor pago dos itens.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd        := (v_item->>'quantidade')::INTEGER;
    v_valor_pago := (v_item->>'valor_pago_unitario')::NUMERIC;

    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida para "%".', v_item->>'nome';
    END IF;
    IF v_valor_pago IS NULL OR v_valor_pago < 0 THEN
      RAISE EXCEPTION 'Valor pago inválido para "%".', v_item->>'nome';
    END IF;

    v_proporcao      := (v_valor_pago * v_qtd) / v_total_pago;
    v_custo_unitario := v_valor_pago + (v_proporcao * (COALESCE(p_frete, 0) + COALESCE(p_despesas, 0))) / v_qtd;
    v_preco_vista    := ROUND(v_custo_unitario * (1 + p_margem_vista / 100), 2);
    v_preco_prazo    := CASE WHEN p_margem_prazo IS NOT NULL THEN ROUND(v_custo_unitario * (1 + p_margem_prazo / 100), 2) ELSE NULL END;

    v_produto_id := NULLIF(v_item->>'produto_id', '')::UUID;

    IF v_produto_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = v_produto_id AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;

      v_tem_tamanhos := EXISTS (SELECT 1 FROM public.produto_tamanhos WHERE produto_id = v_produto_id);

      UPDATE public.produtos SET
        preco_custo       = ROUND(v_custo_unitario, 2),
        preco_venda       = v_preco_vista,
        preco_venda_prazo = COALESCE(v_preco_prazo, preco_venda_prazo),
        estoque_atual     = CASE WHEN v_tem_tamanhos THEN estoque_atual ELSE estoque_atual + v_qtd END
      WHERE id = v_produto_id;
    ELSE
      IF NULLIF(trim(v_item->>'nome'), '') IS NULL THEN
        RAISE EXCEPTION 'Informe o nome do produto novo.';
      END IF;

      v_tem_tamanhos := false;
      INSERT INTO public.produtos (nome, categoria, preco_custo, preco_venda, preco_venda_prazo, estoque_atual, unidade, empresa_id)
      VALUES (
        trim(v_item->>'nome'),
        COALESCE(NULLIF(v_item->>'categoria', ''), 'outros'),
        ROUND(v_custo_unitario, 2),
        v_preco_vista,
        v_preco_prazo,
        v_qtd,
        'un',
        v_empresa
      )
      RETURNING id INTO v_produto_id;
    END IF;

    INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, empresa_id)
    VALUES (v_produto_id, 'entrada', v_qtd, 'Entrada de mercadoria', 'entrada_manual', v_empresa);

    produto_id        := v_produto_id;
    nome              := trim(v_item->>'nome');
    quantidade        := v_qtd;
    custo_unitario    := ROUND(v_custo_unitario, 2);
    preco_venda       := v_preco_vista;
    preco_venda_prazo := v_preco_prazo;
    tem_tamanhos      := v_tem_tamanhos;
    RETURN NEXT;
  END LOOP;
END;
$$;
