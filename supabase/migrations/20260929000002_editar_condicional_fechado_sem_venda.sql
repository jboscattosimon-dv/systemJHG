-- ================================================================
--  Editar condicional também quando fechado sem venda gerada
-- ================================================================
-- Antes só dava pra editar itens de condicional 'aberto'. Agora
-- também libera pra 'fechado' SE nenhum item virou venda de verdade
-- (venda_id IS NULL — ou seja, tudo foi devolvido). Nesse caso a
-- edição reabre o condicional (volta pra 'aberto', com os itens
-- novos voltando a 'pendente'), porque editar a lista de peças que
-- saíram exige decidir de novo o que foi vendido/devolvido.
--
-- Se já existe venda_id (algum item virou venda de verdade, com
-- estoque debitado, comissão e caixa lançados), bloqueia com uma
-- mensagem clara — a correção nesse caso é editar a venda gerada
-- (editar_venda), não os itens do condicional.
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
  v_condicional RECORD;
  v_item       JSONB;
  v_tamanho    TEXT;
  v_disponivel INTEGER;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  SELECT * INTO v_condicional FROM public.condicionais WHERE id = p_condicional_id AND empresa_id = v_empresa;
  IF v_condicional IS NULL THEN
    RAISE EXCEPTION 'Condicional não encontrado, ou de outra loja.';
  END IF;

  IF v_condicional.status = 'fechado' AND v_condicional.venda_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esse condicional já gerou uma venda — edite a venda diretamente em Vendas.';
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

  -- Fechado sem venda = reabre, porque os itens novos precisam de uma
  -- decisão (vendido/devolvido) de novo antes de fechar de vez.
  UPDATE public.condicionais
  SET observacao = NULLIF(p_observacao, ''),
      status = 'aberto',
      fechado_em = NULL
  WHERE id = p_condicional_id;
END;
$$;
