-- ================================================================
--  Editar condicional aberto — adicionar/remover/ajustar itens
-- ================================================================
-- Só permite editar um condicional ainda 'aberto' (o fechado já virou
-- venda de verdade nos itens marcados 'vendido' — editar_venda cobre
-- esse caso). Estoque não é debitado enquanto o condicional está
-- aberto, então editar aqui é simples: substitui a lista de itens
-- inteira (apaga os atuais e insere a nova), igual o fluxo de
-- criar_condicional, validando catálogo e estoque por tamanho do
-- mesmo jeito.

CREATE OR REPLACE FUNCTION public.editar_condicional(
  p_condicional_id UUID,
  p_itens          JSONB,
  p_observacao     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_item       JSONB;
  v_tamanho    TEXT;
  v_disponivel INTEGER;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.condicionais
    WHERE id = p_condicional_id AND empresa_id = v_empresa AND status = 'aberto'
  ) THEN
    RAISE EXCEPTION 'Condicional não encontrado, de outra loja, ou já fechado.';
  END IF;

  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'O condicional precisa de ao menos um produto.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = (v_item->>'produto_id')::UUID AND empresa_id = v_empresa) THEN
      RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
    END IF;

    v_tamanho := NULLIF(v_item->>'tamanho', '');
    IF v_tamanho IS NOT NULL THEN
      SELECT quantidade INTO v_disponivel FROM public.produto_tamanhos
      WHERE produto_id = (v_item->>'produto_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa;
      IF v_disponivel IS NULL THEN
        RAISE EXCEPTION 'Tamanho % não cadastrado para "%".', v_tamanho, v_item->>'nome';
      ELSIF v_disponivel < (v_item->>'quantidade')::INTEGER THEN
        RAISE EXCEPTION 'Estoque insuficiente de "%" tamanho % — disponível: %.', v_item->>'nome', v_tamanho, v_disponivel;
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.itens_condicional WHERE condicional_id = p_condicional_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO public.itens_condicional (condicional_id, produto_id, nome, tamanho, quantidade, preco_unitario, empresa_id)
    VALUES (
      p_condicional_id,
      (v_item->>'produto_id')::UUID,
      v_item->>'nome',
      NULLIF(v_item->>'tamanho', ''),
      (v_item->>'quantidade')::INTEGER,
      (v_item->>'preco_unitario')::NUMERIC,
      v_empresa
    );
  END LOOP;

  UPDATE public.condicionais
  SET observacao = NULLIF(p_observacao, '')
  WHERE id = p_condicional_id;
END;
$$;
