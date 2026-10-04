-- ================================================================
--  Condicional mantém o preço do dia em que a peça foi separada
-- ================================================================
-- Peça que entra no condicional durante uma promoção fica com o preço
-- promocional até o fechamento, mesmo que a promoção acabe antes.
-- O preço à vista já ficava gravado em itens_condicional.preco_unitario;
-- faltava o preço a prazo (pago no crédito), que era lido do produto só
-- na hora de fechar — agora fica gravado em preco_unitario_prazo.
-- Itens antigos (coluna nula) continuam usando o preço a prazo atual
-- do produto, como antes.
--
-- De quebra, corrige uma regressão da 20260921000008 (desconto no
-- condicional): ao recriar fechar_condicional ela voltou à versão sem
-- tamanho e sem preço a prazo — a venda gerada não baixava o estoque
-- do tamanho e cobrava o preço à vista no crédito, diferente da prévia
-- da tela. A versão abaixo junta as três coisas: tamanho, preço a
-- prazo e desconto.

ALTER TABLE public.itens_condicional ADD COLUMN IF NOT EXISTS preco_unitario_prazo NUMERIC(10,2);

-- ── criar_condicional: grava também o preço a prazo do item ──
CREATE OR REPLACE FUNCTION public.criar_condicional(
  p_cliente_id UUID,
  p_itens      JSONB,
  p_observacao TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa        UUID := public.minha_empresa();
  v_condicional_id UUID;
  v_item           JSONB;
  v_tamanho        TEXT;
  v_disponivel     INTEGER;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Cliente não encontrado no cadastro da sua loja.';
  END IF;

  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um produto ao condicional.';
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

  INSERT INTO public.condicionais (cliente_id, usuario_id, observacao, empresa_id)
  VALUES (p_cliente_id, auth.uid(), NULLIF(p_observacao, ''), v_empresa)
  RETURNING id INTO v_condicional_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO public.itens_condicional (condicional_id, produto_id, nome, tamanho, quantidade, preco_unitario, preco_unitario_prazo, empresa_id)
    VALUES (
      v_condicional_id,
      (v_item->>'produto_id')::UUID,
      v_item->>'nome',
      NULLIF(v_item->>'tamanho', ''),
      (v_item->>'quantidade')::INTEGER,
      (v_item->>'preco_unitario')::NUMERIC,
      NULLIF(v_item->>'preco_unitario_prazo', '')::NUMERIC,
      v_empresa
    );
  END LOOP;

  RETURN v_condicional_id;
END;
$$;

-- ── editar_condicional: grava também o preço a prazo do item ──
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
    INSERT INTO public.itens_condicional (condicional_id, produto_id, nome, tamanho, quantidade, preco_unitario, preco_unitario_prazo, empresa_id)
    VALUES (
      p_condicional_id,
      (v_item->>'produto_id')::UUID,
      v_item->>'nome',
      NULLIF(v_item->>'tamanho', ''),
      (v_item->>'quantidade')::INTEGER,
      (v_item->>'preco_unitario')::NUMERIC,
      NULLIF(v_item->>'preco_unitario_prazo', '')::NUMERIC,
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

-- ── fechar_condicional: tamanho + preço a prazo travado + desconto ──
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
        'referencia_id', ic.produto_id,
        'nome', ic.nome,
        'tamanho', ic.tamanho,
        'quantidade', ic.quantidade,
        'preco_unitario', CASE WHEN p_forma_pagamento = 'credito'
          THEN COALESCE(ic.preco_unitario_prazo, p.preco_venda_prazo, ic.preco_unitario)
          ELSE ic.preco_unitario END,
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
    v_venda_id := public.finalizar_venda(v_cliente_nome, v_cliente_id, p_forma_pagamento, v_itens_venda, 1, 0, COALESCE(p_desconto, 0));
  END IF;

  UPDATE public.condicionais
  SET status = 'fechado', fechado_em = NOW(), venda_id = v_venda_id
  WHERE id = p_condicional_id;

  RETURN v_venda_id;
END;
$$;
