-- ================================================================
--  Fornecedores
-- ================================================================
-- Base para o módulo de compras e contas a pagar.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.fornecedores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT NOT NULL,
  nome_fantasia  TEXT,
  documento      TEXT,
  telefone       TEXT,
  email          TEXT,
  endereco       TEXT,
  observacoes    TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_nome ON public.fornecedores (nome);

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON public.fornecedores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
