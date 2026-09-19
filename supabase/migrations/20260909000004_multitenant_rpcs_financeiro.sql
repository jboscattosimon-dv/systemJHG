-- ================================================================
--  Fase 8d — RPCs financeiras multi-tenant
-- ================================================================

CREATE OR REPLACE FUNCTION public.criar_conta_pagar(
  p_fornecedor_id   UUID,
  p_categoria_id    UUID,
  p_descricao       TEXT,
  p_valor_total     NUMERIC,
  p_data_vencimento DATE,
  p_total_parcelas  INTEGER DEFAULT 1,
  p_observacao      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a pagar.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_parcela, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_valor_ultima, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$$;

CREATE OR REPLACE FUNCTION public.criar_conta_receber(
  p_cliente_id      UUID,
  p_categoria_id    UUID,
  p_descricao       TEXT,
  p_valor_total     NUMERIC,
  p_data_vencimento DATE,
  p_total_parcelas  INTEGER DEFAULT 1,
  p_observacao      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a receber.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_parcela, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_valor_ultima, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$$;

CREATE OR REPLACE FUNCTION public.baixar_conta_pagar(
  p_conta_id UUID, p_valor_pago NUMERIC, p_forma_pagamento_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_conta RECORD;
  v_novo_pago NUMERIC(10,2);
  v_sessao_id UUID;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a pagar.';
  END IF;

  SELECT * INTO v_conta FROM public.contas_pagar WHERE id = p_conta_id AND empresa_id = v_empresa FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível pagar novamente.', v_conta.status; END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;

  UPDATE public.contas_pagar
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, empresa_id)
  VALUES ('saida', 'conta_a_pagar', 'Pagamento — ' || v_conta.descricao, p_valor_pago, v_sessao_id, v_empresa);
END;
$$;

CREATE OR REPLACE FUNCTION public.baixar_conta_receber(
  p_conta_id UUID, p_valor_pago NUMERIC, p_forma_pagamento_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_conta RECORD;
  v_novo_pago NUMERIC(10,2);
  v_sessao_id UUID;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a receber.';
  END IF;

  SELECT * INTO v_conta FROM public.contas_receber WHERE id = p_conta_id AND empresa_id = v_empresa FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível receber novamente.', v_conta.status; END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;

  UPDATE public.contas_receber
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, empresa_id)
  VALUES ('entrada', 'conta_a_receber', 'Recebimento — ' || v_conta.descricao, p_valor_pago, v_sessao_id, v_empresa);
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_dre(p_inicio DATE, p_fim DATE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_receita_servicos NUMERIC(12,2);
  v_receita_produtos NUMERIC(12,2);
  v_outras_receitas  NUMERIC(12,2);
  v_cmv              NUMERIC(12,2);
  v_comissoes        NUMERIC(12,2);
  v_despesas         JSONB;
  v_total_despesas   NUMERIC(12,2);
  v_receita_bruta    NUMERIC(12,2);
  v_lucro_bruto      NUMERIC(12,2);
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para ver a DRE.';
  END IF;

  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_servicos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'servico' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND c.empresa_id = v_empresa;

  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_produtos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND c.empresa_id = v_empresa;

  SELECT COALESCE(SUM(valor_pago), 0) INTO v_outras_receitas
  FROM public.contas_receber
  WHERE data_pagamento BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa;

  SELECT COALESCE(SUM(ic.quantidade * COALESCE(ic.custo_unitario, 0)), 0) INTO v_cmv
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND c.empresa_id = v_empresa;

  SELECT COALESCE(SUM(co.valor_comissao), 0) INTO v_comissoes
  FROM public.comissoes co
  JOIN public.comandas c ON c.id = co.comanda_id
  WHERE c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND co.status <> 'cancelada' AND c.empresa_id = v_empresa;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('categoria', cat, 'valor', total) ORDER BY total DESC), '[]'::jsonb),
         COALESCE(SUM(total), 0)
  INTO v_despesas, v_total_despesas
  FROM (
    SELECT COALESCE(cf.nome, 'Sem categoria') AS cat, SUM(cp.valor_pago) AS total
    FROM public.contas_pagar cp
    LEFT JOIN public.categorias_financeiras cf ON cf.id = cp.categoria_id
    WHERE cp.data_pagamento BETWEEN p_inicio AND p_fim AND cp.empresa_id = v_empresa
    GROUP BY COALESCE(cf.nome, 'Sem categoria')
  ) t;

  v_receita_bruta := v_receita_servicos + v_receita_produtos + v_outras_receitas;
  v_lucro_bruto   := v_receita_bruta - (v_cmv + v_comissoes);

  RETURN jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
    'receita_servicos', v_receita_servicos,
    'receita_produtos', v_receita_produtos,
    'outras_receitas', v_outras_receitas,
    'receita_bruta', v_receita_bruta,
    'cmv', v_cmv,
    'comissoes', v_comissoes,
    'custos_total', v_cmv + v_comissoes,
    'lucro_bruto', v_lucro_bruto,
    'despesas_por_categoria', v_despesas,
    'despesas_total', v_total_despesas,
    'resultado_operacional', v_lucro_bruto - v_total_despesas
  );
END;
$$;
