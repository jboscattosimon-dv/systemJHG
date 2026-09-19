-- ================================================================
--  PDV real: baixa de estoque, comissão e caixa em uma transação
-- ================================================================
-- Até aqui o PDV só criava a comanda/itens e o movimento de caixa,
-- sem baixar estoque nem gerar comissão. Esta migração cria:
--   - movimentacoes_estoque: histórico de toda alteração de estoque
--   - comissoes: comissão gerada por item vendido
--   - comandas: novos estados + vínculo com profissional/agendamento
--   - finalizar_venda(): função que faz tudo isso numa transação só,
--     para nunca ficar com comanda gravada mas estoque/comissão/caixa
--     inconsistentes entre si.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.movimentacoes_estoque (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id      UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ajuste','perda','devolucao','venda','inventario')),
  quantidade      INTEGER NOT NULL,
  motivo          TEXT,
  referencia_tipo TEXT,
  referencia_id   UUID,
  usuario_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_produto ON public.movimentacoes_estoque (produto_id);
ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.movimentacoes_estoque;
CREATE POLICY "auth_all" ON public.movimentacoes_estoque FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.comissoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id  UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  comanda_id       UUID REFERENCES public.comandas(id) ON DELETE SET NULL,
  item_comanda_id  UUID REFERENCES public.itens_comanda(id) ON DELETE SET NULL,
  valor_base       NUMERIC(10,2) NOT NULL,
  percentual       NUMERIC(5,2) NOT NULL,
  valor_comissao   NUMERIC(10,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','paga','cancelada')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comissoes_profissional ON public.comissoes (profissional_id);
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all" ON public.comissoes;
CREATE POLICY "auth_all" ON public.comissoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.comandas
  ADD COLUMN IF NOT EXISTS profissional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agendamento_id  UUID REFERENCES public.agendamentos(id) ON DELETE SET NULL;

ALTER TABLE public.comandas DROP CONSTRAINT IF EXISTS comandas_status_check;
ALTER TABLE public.comandas ADD CONSTRAINT comandas_status_check
  CHECK (status IN ('aberta','em_atendimento','aguardando_pagamento','fechada','cancelada'));

-- Finaliza uma venda do PDV de forma atômica: cria a comanda, os
-- itens, baixa estoque de produtos (com histórico), calcula
-- comissão (serviço tem prioridade sobre o percentual padrão do
-- profissional) e lança o movimento de caixa. Se qualquer passo
-- falhar, nada é gravado.
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
  v_total               NUMERIC(10,2) := 0;
  v_item                JSONB;
  v_item_id             UUID;
  v_profissional_id     UUID;
  v_comissao_percentual NUMERIC(5,2);
  v_valor               NUMERIC(10,2);
  v_qtd                 INTEGER;
BEGIN
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

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, comanda_id)
  VALUES ('entrada', 'venda', 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), v_total, v_comanda_id);

  RETURN v_comanda_id;
END;
$$;
