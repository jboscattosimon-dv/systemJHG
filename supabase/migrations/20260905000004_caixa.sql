-- ================================================================
--  Caixa real: abertura, sangria/suprimento, fechamento
-- ================================================================
-- Até aqui "caixa" era só a tabela movimentos_caixa (lançamentos
-- soltos), sem noção de sessão aberta/fechada. Esta migração cria
-- sessoes_caixa (abertura com valor inicial, fechamento com
-- conferência) e vincula cada movimento à sessão em que ocorreu.
-- Vendas do PDV só são aceitas com o caixa aberto.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.sessoes_caixa (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor_inicial         NUMERIC(10,2) NOT NULL DEFAULT 0,
  aberto_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fechado_em            TIMESTAMPTZ,
  saldo_esperado        NUMERIC(10,2),
  valor_informado        NUMERIC(10,2),
  diferenca             NUMERIC(10,2),
  observacao_fechamento TEXT,
  status                TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado'))
);

-- Impede duas sessões abertas ao mesmo tempo para o mesmo operador
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_caixa_aberta_unica
  ON public.sessoes_caixa (usuario_id) WHERE (status = 'aberto');

ALTER TABLE public.sessoes_caixa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.sessoes_caixa;
CREATE POLICY "auth_all" ON public.sessoes_caixa FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.movimentos_caixa
  ADD COLUMN IF NOT EXISTS sessao_caixa_id UUID REFERENCES public.sessoes_caixa(id) ON DELETE SET NULL;

-- Abre uma sessão de caixa para o usuário logado.
CREATE OR REPLACE FUNCTION public.abrir_caixa(p_valor_inicial NUMERIC)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto') THEN
    RAISE EXCEPTION 'Você já tem um caixa aberto.';
  END IF;

  INSERT INTO public.sessoes_caixa (usuario_id, valor_inicial)
  VALUES (auth.uid(), COALESCE(p_valor_inicial, 0))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Fecha a sessão, calculando o saldo esperado a partir dos
-- movimentos reais e registrando a diferença contra o valor
-- informado na conferência física.
CREATE OR REPLACE FUNCTION public.fechar_caixa(p_sessao_id UUID, p_valor_informado NUMERIC, p_observacao TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicial  NUMERIC;
  v_entradas NUMERIC;
  v_saidas   NUMERIC;
  v_esperado NUMERIC;
BEGIN
  SELECT valor_inicial INTO v_inicial
  FROM public.sessoes_caixa WHERE id = p_sessao_id AND status = 'aberto';

  IF v_inicial IS NULL THEN
    RAISE EXCEPTION 'Sessão de caixa não encontrada ou já fechada.';
  END IF;

  SELECT COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada'), 0),
         COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida'), 0)
  INTO v_entradas, v_saidas
  FROM public.movimentos_caixa
  WHERE sessao_caixa_id = p_sessao_id;

  v_esperado := v_inicial + v_entradas - v_saidas;

  UPDATE public.sessoes_caixa
  SET status = 'fechado',
      fechado_em = NOW(),
      saldo_esperado = v_esperado,
      valor_informado = p_valor_informado,
      diferenca = p_valor_informado - v_esperado,
      observacao_fechamento = p_observacao
  WHERE id = p_sessao_id;
END;
$$;

-- Lança sangria (saida) ou suprimento (entrada) no caixa aberto do
-- usuário logado. Recusa se não houver caixa aberto.
CREATE OR REPLACE FUNCTION public.registrar_movimento_caixa(
  p_tipo TEXT, p_categoria TEXT, p_descricao TEXT, p_valor NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao_id UUID;
  v_id UUID;
BEGIN
  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de lançar movimentos.';
  END IF;

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id)
  VALUES (p_tipo, p_categoria, p_descricao, p_valor, v_sessao_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- finalizar_venda agora exige caixa aberto e vincula o movimento à
-- sessão (substitui a versão da migração anterior).
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

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id)
    VALUES (v_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd, v_valor, v_profissional_id)
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
