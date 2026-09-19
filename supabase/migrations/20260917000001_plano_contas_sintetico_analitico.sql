-- ================================================================
--  Fase 9 — Contas sintéticas e analíticas no plano de contas
-- ================================================================
-- categorias_financeiras.categoria_pai_id já existe desde o início
-- (schema original), mas nunca foi usado: uma categoria SEM filhas é
-- uma conta analítica (recebe lançamento); uma categoria QUE É PAI de
-- outra(s) passa a ser sintética (só agrupa, não recebe lançamento
-- direto). Esta migração passa a: (1) impedir lançamento em conta
-- sintética, e (2) agrupar despesas pela conta-pai na DRE.

-- ── 1) Trava: contas_pagar/contas_receber não podem usar uma
--    categoria que é pai de outra (conta sintética) ─────────────
CREATE OR REPLACE FUNCTION public.valida_categoria_analitica()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE v_cat RECORD;
BEGIN
  IF NEW.categoria_id IS NOT NULL THEN
    SELECT * INTO v_cat FROM public.categorias_financeiras WHERE id = NEW.categoria_id;
    IF v_cat IS NULL OR v_cat.empresa_id IS DISTINCT FROM NEW.empresa_id THEN
      RAISE EXCEPTION 'Categoria financeira inválida para esta loja.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.categorias_financeiras WHERE categoria_pai_id = NEW.categoria_id) THEN
      RAISE EXCEPTION 'Selecione uma conta analítica (de detalhe) — essa categoria é sintética e só agrupa outras.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_categoria_analitica ON public.contas_pagar;
CREATE TRIGGER trg_valida_categoria_analitica
  BEFORE INSERT OR UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.valida_categoria_analitica();

DROP TRIGGER IF EXISTS trg_valida_categoria_analitica ON public.contas_receber;
CREATE TRIGGER trg_valida_categoria_analitica
  BEFORE INSERT OR UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.valida_categoria_analitica();

-- ── 2) Trava: uma conta que já é filha (analítica) não pode virar
--    pai de outra — mantém a hierarquia em só 2 níveis ───────────
CREATE OR REPLACE FUNCTION public.valida_hierarquia_categoria()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE v_pai RECORD;
BEGIN
  IF NEW.categoria_pai_id IS NOT NULL THEN
    SELECT * INTO v_pai FROM public.categorias_financeiras WHERE id = NEW.categoria_pai_id;
    IF v_pai IS NULL THEN
      RAISE EXCEPTION 'Conta sintética informada não existe.';
    END IF;
    IF v_pai.categoria_pai_id IS NOT NULL THEN
      RAISE EXCEPTION 'A conta sintética não pode ela mesma ter uma conta-pai (só 2 níveis são suportados).';
    END IF;
    IF v_pai.tipo <> NEW.tipo THEN
      RAISE EXCEPTION 'A conta sintética precisa ser do mesmo tipo (receita/despesa).';
    END IF;
    IF v_pai.empresa_id IS DISTINCT FROM NEW.empresa_id THEN
      RAISE EXCEPTION 'A conta sintética precisa ser da mesma loja.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_hierarquia_categoria ON public.categorias_financeiras;
CREATE TRIGGER trg_valida_hierarquia_categoria
  BEFORE INSERT OR UPDATE ON public.categorias_financeiras
  FOR EACH ROW EXECUTE FUNCTION public.valida_hierarquia_categoria();

-- ── 3) calcular_dre: agrupa despesas pela conta sintética (pai)
--    quando a categoria do lançamento tiver uma ──────────────────
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
    SELECT COALESCE(pai.nome, cf.nome, 'Sem categoria') AS cat, SUM(cp.valor_pago) AS total
    FROM public.contas_pagar cp
    LEFT JOIN public.categorias_financeiras cf ON cf.id = cp.categoria_id
    LEFT JOIN public.categorias_financeiras pai ON pai.id = cf.categoria_pai_id
    WHERE cp.data_pagamento BETWEEN p_inicio AND p_fim AND cp.empresa_id = v_empresa
    GROUP BY COALESCE(pai.nome, cf.nome, 'Sem categoria')
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
