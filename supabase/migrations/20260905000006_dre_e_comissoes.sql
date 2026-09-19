-- ================================================================
--  DRE gerencial + correção do custo na venda
-- ================================================================
-- itens_comanda não guardava o custo do produto no momento da
-- venda — só dava pra saber o custo atual do produto, que pode ter
-- mudado depois. Isso quebra a acurácia de qualquer DRE (o CMV de
-- uma venda de 3 meses atrás não pode variar se o preço de custo
-- do produto mudou essa semana). Agora finalizar_venda grava o
-- custo_unitario no momento da venda.
--
-- calcular_dre() monta a DRE gerencial completa de um período a
-- partir dos dados reais (comandas, comissões, contas a pagar
-- baixadas), sem depender de nenhuma tabela nova de lançamentos.
-- ================================================================

ALTER TABLE public.itens_comanda
  ADD COLUMN IF NOT EXISTS custo_unitario NUMERIC(10,2);

CREATE OR REPLACE FUNCTION public.finalizar_venda(
  p_cliente_nome    TEXT,
  p_cliente_id      UUID,
  p_forma_pagamento TEXT,
  p_itens           JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comanda_id          UUID;
  v_sessao_id           UUID;
  v_total               NUMERIC(10,2) := 0;
  v_item                JSONB;
  v_item_id             UUID;
  v_profissional_id     UUID;
  v_comissao_percentual NUMERIC(5,2);
  v_valor               NUMERIC(10,2);
  v_qtd                 INTEGER;
  v_custo_unitario      NUMERIC(10,2);
BEGIN
  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de vender.';
  END IF;

  SELECT COALESCE(SUM((i->>'preco_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total
  FROM jsonb_array_elements(p_itens) i;

  INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, forma_pagamento)
  VALUES (p_cliente_id, COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), 'fechada', v_total, p_forma_pagamento)
  RETURNING id INTO v_comanda_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd             := (v_item->>'quantidade')::INTEGER;
    v_valor           := (v_item->>'preco_unitario')::NUMERIC;
    v_profissional_id := NULLIF(v_item->>'profissional_id', '')::UUID;
    v_comissao_percentual := NULL;
    v_custo_unitario  := NULL;

    IF v_item->>'tipo' = 'produto' THEN
      SELECT preco_custo INTO v_custo_unitario FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario)
    VALUES (v_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd, v_valor, v_profissional_id, v_custo_unitario)
    RETURNING id INTO v_item_id;

    IF v_item->>'tipo' = 'produto' THEN
      UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
      WHERE id = (v_item->>'referencia_id')::UUID;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id)
      VALUES ((v_item->>'referencia_id')::UUID, 'venda', -v_qtd, 'Venda PDV', 'comanda', v_comanda_id);
    END IF;

    IF v_profissional_id IS NOT NULL THEN
      IF v_item->>'tipo' = 'servico' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID;
      END IF;

      IF v_comissao_percentual IS NULL THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.profissionais WHERE id = v_profissional_id;
      END IF;

      IF v_comissao_percentual IS NOT NULL AND v_comissao_percentual > 0 THEN
        INSERT INTO public.comissoes (profissional_id, comanda_id, item_comanda_id, valor_base, percentual, valor_comissao, status)
        VALUES (
          v_profissional_id, v_comanda_id, v_item_id,
          v_valor * v_qtd, v_comissao_percentual,
          ROUND(v_valor * v_qtd * v_comissao_percentual / 100, 2),
          'pendente'
        );
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, comanda_id, sessao_caixa_id)
  VALUES ('entrada', 'venda', 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), v_total, v_comanda_id, v_sessao_id);

  RETURN v_comanda_id;
END;
$$;

-- Monta a DRE gerencial de um período a partir dos dados reais:
--   Receita bruta = serviços + produtos vendidos (comandas fechadas)
--                   + outras receitas (contas a receber baixadas)
--   Custos        = CMV (custo do produto no momento da venda)
--                   + comissões geradas no período
--   Despesas      = contas a pagar baixadas no período, por categoria
CREATE OR REPLACE FUNCTION public.calcular_dre(p_inicio DATE, p_fim DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
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
  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_servicos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'servico' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim;

  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_produtos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim;

  SELECT COALESCE(SUM(valor_pago), 0) INTO v_outras_receitas
  FROM public.contas_receber
  WHERE data_pagamento BETWEEN p_inicio AND p_fim;

  SELECT COALESCE(SUM(ic.quantidade * COALESCE(ic.custo_unitario, 0)), 0) INTO v_cmv
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim;

  SELECT COALESCE(SUM(co.valor_comissao), 0) INTO v_comissoes
  FROM public.comissoes co
  JOIN public.comandas c ON c.id = co.comanda_id
  WHERE c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND co.status <> 'cancelada';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('categoria', cat, 'valor', total) ORDER BY total DESC), '[]'::jsonb),
         COALESCE(SUM(total), 0)
  INTO v_despesas, v_total_despesas
  FROM (
    SELECT COALESCE(cf.nome, 'Sem categoria') AS cat, SUM(cp.valor_pago) AS total
    FROM public.contas_pagar cp
    LEFT JOIN public.categorias_financeiras cf ON cf.id = cp.categoria_id
    WHERE cp.data_pagamento BETWEEN p_inicio AND p_fim
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
