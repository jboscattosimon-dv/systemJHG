-- ================================================================
--  Formas de pagamento
-- ================================================================
-- Cadastro configurável de formas de pagamento. Ainda não substitui
-- o CHECK fixo em comandas.forma_pagamento (pix/credito/debito/
-- dinheiro) — essa migração para PDV/pagamentos fica para a fase
-- de Financeiro/PDV, para não alterar comportamento hoje em
-- produção. Por ora isto é só o cadastro base.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.formas_pagamento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL UNIQUE,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.formas_pagamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON public.formas_pagamento
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.formas_pagamento (nome) VALUES
  ('Dinheiro'), ('PIX'), ('Débito'), ('Crédito'), ('Transferência'), ('Outros')
ON CONFLICT (nome) DO NOTHING;
