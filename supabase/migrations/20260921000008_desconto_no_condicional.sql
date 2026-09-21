-- ================================================================
--  Desconto à vista também no fechamento do Condicional
-- ================================================================
-- Mesma regra de finalizar_venda: desconto (em R$, já calculado no
-- front seja % ou fixo) incide só sobre os itens marcados "vendido"
-- e é repassado direto pra finalizar_venda, que já valida e aplica
-- (reduz comanda.total e o lançamento no caixa; não mexe em preço
-- unitário nem comissão). Sem desconto nenhum, comportamento segue
-- idêntico a antes (p_desconto default 0).
--
-- DROP explícito antes de recriar — CREATE OR REPLACE não permite
-- adicionar parâmetro novo à assinatura existente.

DROP FUNCTION IF EXISTS public.fechar_condicional(UUID, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.fechar_condicional(
  p_condicional_id  UUID,
  p_decisoes        JSONB,
  p_forma_pagamento TEXT DEFAULT NULL,
  p_desconto        NUMERIC DEFAULT 0
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
        'referencia_id', produto_id,
        'nome', nome,
        'quantidade', quantidade,
        'preco_unitario', preco_unitario,
        'profissional_id', NULL
      ) INTO v_itens_venda
      FROM public.itens_condicional WHERE id = v_item_id;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.itens_condicional WHERE condicional_id = p_condicional_id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Todos os itens precisam de uma decisão (vendido ou devolvido) antes de fechar.';
  END IF;

  IF jsonb_array_length(v_itens_venda) > 0 THEN
    IF p_forma_pagamento IS NULL THEN
      RAISE EXCEPTION 'Informe a forma de pagamento para os itens vendidos.';
    END IF;
    v_venda_id := public.finalizar_venda(v_cliente_nome, v_cliente_id, p_forma_pagamento, v_itens_venda, 1, 0, COALESCE(p_desconto, 0));
  END IF;

  UPDATE public.condicionais
  SET status = 'fechado', fechado_em = NOW(), venda_id = v_venda_id
  WHERE id = p_condicional_id;

  RETURN v_venda_id;
END;
$$;
