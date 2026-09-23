-- ================================================================
--  Capital inicial + baixas/movimentos passam a saber a conta
-- ================================================================
-- Capital inicial vira um lançamento de verdade em movimentos_caixa
-- (categoria 'capital_inicial'), não um campo solto separado do
-- histórico — cada conta só aceita um (guarda contra duplicar).
--
-- registrar_movimento_caixa, baixar_conta_pagar, baixar_conta_receber
-- e finalizar_venda (venda à vista) ganham p_conta_financeira_id
-- opcional — quando não informado, cai na conta padrão da loja, então
-- nenhuma chamada existente no front quebra.

CREATE OR REPLACE FUNCTION public.registrar_capital_inicial(
  p_conta_financeira_id UUID,
  p_valor               NUMERIC,
  p_data                DATE DEFAULT CURRENT_DATE,
  p_observacao          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_id      UUID;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar capital inicial.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.movimentos_caixa WHERE conta_financeira_id = p_conta_financeira_id AND categoria = 'capital_inicial') THEN
    RAISE EXCEPTION 'Essa conta já tem um saldo inicial lançado.';
  END IF;

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, data, conta_financeira_id, empresa_id)
  VALUES ('entrada', 'capital_inicial', COALESCE(NULLIF(p_observacao, ''), 'Saldo inicial'), p_valor, p_data, p_conta_financeira_id, v_empresa)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── registrar_movimento_caixa ────────────────────────────────────
DROP FUNCTION IF EXISTS public.registrar_movimento_caixa(TEXT, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.registrar_movimento_caixa(
  p_tipo TEXT, p_categoria TEXT, p_descricao TEXT, p_valor NUMERIC,
  p_conta_financeira_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sessao_id UUID;
  v_empresa   UUID := public.minha_empresa();
  v_conta     UUID;
  v_id        UUID;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de lançar movimentos.';
  END IF;

  v_conta := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES (p_tipo, p_categoria, p_descricao, p_valor, v_sessao_id, v_conta, v_empresa)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── baixar_conta_pagar ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.baixar_conta_pagar(UUID, NUMERIC, UUID);

CREATE OR REPLACE FUNCTION public.baixar_conta_pagar(
  p_conta_id UUID, p_valor_pago NUMERIC, p_forma_pagamento_id UUID DEFAULT NULL,
  p_conta_financeira_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_conta      RECORD;
  v_novo_pago  NUMERIC(10,2);
  v_sessao_id  UUID;
  v_conta_fin  UUID;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a pagar.';
  END IF;

  SELECT * INTO v_conta FROM public.contas_pagar WHERE id = p_conta_id AND empresa_id = v_empresa FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível pagar novamente.', v_conta.status; END IF;
  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN RAISE EXCEPTION 'Informe um valor maior que zero.'; END IF;
  IF v_conta.valor_pago + p_valor_pago > v_conta.valor THEN
    RAISE EXCEPTION 'Valor pago (%) excede o saldo restante (%) dessa conta.', p_valor_pago, (v_conta.valor - v_conta.valor_pago);
  END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;
  v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  UPDATE public.contas_pagar
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('saida', 'conta_a_pagar', 'Pagamento — ' || v_conta.descricao, p_valor_pago, v_sessao_id, v_conta_fin, v_empresa);
END;
$$;

-- ── baixar_conta_receber ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.baixar_conta_receber(UUID, NUMERIC, UUID);

CREATE OR REPLACE FUNCTION public.baixar_conta_receber(
  p_conta_id UUID, p_valor_pago NUMERIC, p_forma_pagamento_id UUID DEFAULT NULL,
  p_conta_financeira_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_conta      RECORD;
  v_novo_pago  NUMERIC(10,2);
  v_sessao_id  UUID;
  v_conta_fin  UUID;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a receber.';
  END IF;

  SELECT * INTO v_conta FROM public.contas_receber WHERE id = p_conta_id AND empresa_id = v_empresa FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível receber novamente.', v_conta.status; END IF;
  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN RAISE EXCEPTION 'Informe um valor maior que zero.'; END IF;
  IF v_conta.valor_pago + p_valor_pago > v_conta.valor THEN
    RAISE EXCEPTION 'Valor recebido (%) excede o saldo restante (%) dessa conta.', p_valor_pago, (v_conta.valor - v_conta.valor_pago);
  END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;
  v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  UPDATE public.contas_receber
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('entrada', 'conta_a_receber', 'Recebimento — ' || v_conta.descricao, p_valor_pago, v_sessao_id, v_conta_fin, v_empresa);
END;
$$;

-- ── finalizar_venda: venda à vista também escolhe a conta ────────
DROP FUNCTION IF EXISTS public.finalizar_venda(TEXT, UUID, TEXT, JSONB, INTEGER, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION public.finalizar_venda(
  p_cliente_nome           TEXT,
  p_cliente_id             UUID,
  p_forma_pagamento        TEXT,
  p_itens                  JSONB,
  p_total_parcelas         INTEGER DEFAULT 1,
  p_taxa_cartao_percentual NUMERIC DEFAULT 0,
  p_desconto               NUMERIC DEFAULT 0,
  p_conta_financeira_id    UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa             UUID := public.minha_empresa();
  v_comanda_id          UUID;
  v_sessao_id           UUID;
  v_total               NUMERIC(10,2) := 0;
  v_total_final         NUMERIC(10,2);
  v_total_a_receber     NUMERIC(10,2);
  v_item                JSONB;
  v_item_id             UUID;
  v_profissional_id     UUID;
  v_comissao_percentual NUMERIC(5,2);
  v_valor               NUMERIC(10,2);
  v_qtd                 INTEGER;
  v_custo_unitario      NUMERIC(10,2);
  v_tamanho             TEXT;
  v_disponivel          INTEGER;
  v_parcelas            INTEGER;
  v_valor_parcela       NUMERIC(10,2);
  v_valor_parcela_i     NUMERIC(10,2);
  v_soma_parcelas       NUMERIC(10,2);
  v_grupo_parcelamento  UUID;
  v_conta_fin           UUID;
  i                     INTEGER;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_forma_pagamento = 'parcelado' AND p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um cliente cadastrado para vender parcelado.';
  END IF;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de vender.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    IF v_item->>'tipo' = 'produto' THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;

      v_tamanho := NULLIF(v_item->>'tamanho', '');
      IF v_tamanho IS NOT NULL THEN
        SELECT quantidade INTO v_disponivel FROM public.produto_tamanhos
        WHERE produto_id = (v_item->>'referencia_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa;
        IF v_disponivel IS NOT NULL AND v_disponivel < (v_item->>'quantidade')::INTEGER THEN
          RAISE EXCEPTION 'Estoque insuficiente de "%" tamanho % — disponível: %.', v_item->>'nome', v_tamanho, v_disponivel;
        END IF;
      END IF;
    ELSIF v_item->>'tipo' = 'servico' THEN
      IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Serviço "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM((i->>'preco_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total
  FROM jsonb_array_elements(p_itens) i;

  v_total_final := CASE
    WHEN p_forma_pagamento = 'parcelado' THEN v_total
    ELSE GREATEST(0, v_total - COALESCE(p_desconto, 0))
  END;

  INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, forma_pagamento, empresa_id)
  VALUES (p_cliente_id, COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), 'fechada', v_total_final, p_forma_pagamento, v_empresa)
  RETURNING id INTO v_comanda_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd             := (v_item->>'quantidade')::INTEGER;
    v_valor           := (v_item->>'preco_unitario')::NUMERIC;
    v_profissional_id := NULLIF(v_item->>'profissional_id', '')::UUID;
    v_tamanho         := NULLIF(v_item->>'tamanho', '');
    v_comissao_percentual := NULL;
    v_custo_unitario  := NULL;

    IF v_item->>'tipo' = 'produto' THEN
      SELECT preco_custo INTO v_custo_unitario FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario, tamanho, empresa_id)
    VALUES (v_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd, v_valor, v_profissional_id, v_custo_unitario, v_tamanho, v_empresa)
    RETURNING id INTO v_item_id;

    IF v_item->>'tipo' = 'produto' THEN
      IF v_tamanho IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.produto_tamanhos
        WHERE produto_id = (v_item->>'referencia_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa
      ) THEN
        UPDATE public.produto_tamanhos SET quantidade = quantidade - v_qtd
        WHERE produto_id = (v_item->>'referencia_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa;
      ELSE
        UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
        WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      END IF;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES ((v_item->>'referencia_id')::UUID, 'venda', -v_qtd, 'Venda PDV' || CASE WHEN v_tamanho IS NOT NULL THEN ' — tamanho ' || v_tamanho ELSE '' END, 'comanda', v_comanda_id, v_empresa);
    END IF;

    IF v_profissional_id IS NOT NULL THEN
      IF v_item->>'tipo' = 'servico' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      ELSIF v_item->>'tipo' = 'produto' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NULL THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.profissionais WHERE id = v_profissional_id AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NOT NULL AND v_comissao_percentual > 0 THEN
        INSERT INTO public.comissoes (profissional_id, comanda_id, item_comanda_id, valor_base, percentual, valor_comissao, status, empresa_id)
        VALUES (
          v_profissional_id, v_comanda_id, v_item_id,
          v_valor * v_qtd, v_comissao_percentual,
          ROUND(v_valor * v_qtd * v_comissao_percentual / 100, 2),
          'pendente', v_empresa
        );
      END IF;
    END IF;
  END LOOP;

  IF p_forma_pagamento = 'parcelado' THEN
    v_total_a_receber := CASE
      WHEN p_taxa_cartao_percentual > 0 THEN ROUND(v_total_final / (1 - p_taxa_cartao_percentual / 100), 2)
      ELSE v_total_final
    END;

    v_parcelas := GREATEST(1, COALESCE(p_total_parcelas, 1));
    v_valor_parcela := ROUND(v_total_a_receber / v_parcelas, 2);
    v_soma_parcelas := 0;
    v_grupo_parcelamento := gen_random_uuid();

    FOR i IN 1..v_parcelas LOOP
      IF i < v_parcelas THEN
        v_valor_parcela_i := v_valor_parcela;
        v_soma_parcelas := v_soma_parcelas + v_valor_parcela;
      ELSE
        v_valor_parcela_i := v_total_a_receber - v_soma_parcelas;
      END IF;

      INSERT INTO public.contas_receber (
        cliente_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, origem, comanda_id, empresa_id
      ) VALUES (
        p_cliente_id,
        'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Cliente')
          || CASE WHEN p_taxa_cartao_percentual > 0 THEN ' (cartão)' ELSE ' (crediário)' END
          || CASE WHEN v_parcelas > 1 THEN format(' (%s/%s)', i, v_parcelas) ELSE '' END,
        v_valor_parcela_i, (CURRENT_DATE + (i * INTERVAL '30 days'))::DATE,
        i, v_parcelas, v_grupo_parcelamento, 'venda', v_comanda_id, v_empresa
      );
    END LOOP;
  ELSE
    v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());
    INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, comanda_id, sessao_caixa_id, conta_financeira_id, empresa_id)
    VALUES ('entrada', 'venda', 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), v_total_final, v_comanda_id, v_sessao_id, v_conta_fin, v_empresa);
  END IF;

  RETURN v_comanda_id;
END;
$$;
