-- ================================================================
--  Contas a pagar e a receber, com parcelamento e baixa
-- ================================================================
-- Cada parcela é sua própria linha (mais simples que uma tabela
-- separada de parcelas, e cobre o caso de uso do escopo: uma compra
-- em 3x vira 3 linhas com vencimento/status próprios, agrupadas por
-- grupo_parcelamento). status 'parcial' cobre pagamento parcial;
-- 'vencida' não é um status gravado — é calculado (aberta/parcial +
-- vencimento no passado), pra nunca precisar de um job pra manter
-- em dia.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id       UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  categoria_id        UUID REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL,
  descricao           TEXT NOT NULL,
  valor               NUMERIC(10,2) NOT NULL,
  valor_pago          NUMERIC(10,2) NOT NULL DEFAULT 0,
  data_emissao        DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento     DATE NOT NULL,
  data_pagamento      DATE,
  forma_pagamento_id  UUID REFERENCES public.formas_pagamento(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','parcial','paga','cancelada')),
  centro_custo        TEXT,
  observacao          TEXT,
  origem              TEXT NOT NULL DEFAULT 'manual',
  numero_parcela      INTEGER NOT NULL DEFAULT 1,
  total_parcelas      INTEGER NOT NULL DEFAULT 1,
  grupo_parcelamento  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON public.contas_pagar (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON public.contas_pagar (status);
ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.contas_pagar;
CREATE POLICY "auth_all" ON public.contas_pagar FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.contas_receber (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  categoria_id        UUID REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL,
  descricao           TEXT NOT NULL,
  valor               NUMERIC(10,2) NOT NULL,
  valor_pago          NUMERIC(10,2) NOT NULL DEFAULT 0,
  data_emissao        DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento     DATE NOT NULL,
  data_pagamento      DATE,
  forma_pagamento_id  UUID REFERENCES public.formas_pagamento(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','parcial','paga','cancelada')),
  observacao          TEXT,
  origem              TEXT NOT NULL DEFAULT 'manual',
  numero_parcela      INTEGER NOT NULL DEFAULT 1,
  total_parcelas      INTEGER NOT NULL DEFAULT 1,
  grupo_parcelamento  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON public.contas_receber (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON public.contas_receber (status);
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.contas_receber;
CREATE POLICY "auth_all" ON public.contas_receber FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Cria uma conta a pagar, opcionalmente parcelada (parcelas mensais,
-- a última absorve o resto do arredondamento).
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_parcela, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual'
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_valor_ultima, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual'
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$$;

-- Cria uma conta a receber, opcionalmente parcelada (mesma lógica
-- de criar_conta_pagar).
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_parcela, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual'
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_valor_ultima, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual'
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$$;

-- Registra o pagamento (total ou parcial) de uma conta a pagar e
-- lança o movimento de caixa correspondente.
CREATE OR REPLACE FUNCTION public.baixar_conta_pagar(
  p_conta_id UUID, p_valor_pago NUMERIC, p_forma_pagamento_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta RECORD;
  v_novo_pago NUMERIC(10,2);
  v_sessao_id UUID;
BEGIN
  SELECT * INTO v_conta FROM public.contas_pagar WHERE id = p_conta_id FOR UPDATE;
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

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id)
  VALUES ('saida', 'conta_a_pagar', 'Pagamento — ' || v_conta.descricao, p_valor_pago, v_sessao_id);
END;
$$;

-- Registra o recebimento (total ou parcial) de uma conta a receber
-- e lança o movimento de caixa correspondente.
CREATE OR REPLACE FUNCTION public.baixar_conta_receber(
  p_conta_id UUID, p_valor_pago NUMERIC, p_forma_pagamento_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta RECORD;
  v_novo_pago NUMERIC(10,2);
  v_sessao_id UUID;
BEGIN
  SELECT * INTO v_conta FROM public.contas_receber WHERE id = p_conta_id FOR UPDATE;
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

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id)
  VALUES ('entrada', 'conta_a_receber', 'Recebimento — ' || v_conta.descricao, p_valor_pago, v_sessao_id);
END;
$$;
