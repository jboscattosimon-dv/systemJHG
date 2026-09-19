-- ================================================================
--  Fase 2 — Cadastros: campos adicionais
-- ================================================================
-- Amplia clientes, profissionais, servicos e produtos com os campos
-- descritos no escopo de ERP, sem quebrar nada que já existe (só
-- ADD COLUMN, tudo opcional ou com default seguro).
-- ================================================================

-- ── Clientes ────────────────────────────────────────────────
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS cpf             TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS endereco        TEXT,
  ADD COLUMN IF NOT EXISTS observacoes     TEXT,
  ADD COLUMN IF NOT EXISTS ativo           BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Profissionais ───────────────────────────────────────────
ALTER TABLE public.profissionais
  ADD COLUMN IF NOT EXISTS email      TEXT,
  ADD COLUMN IF NOT EXISTS documento  TEXT,
  ADD COLUMN IF NOT EXISTS valor_fixo NUMERIC(10,2);

-- ── Serviços ────────────────────────────────────────────────
ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS descricao           TEXT,
  ADD COLUMN IF NOT EXISTS categoria           TEXT,
  ADD COLUMN IF NOT EXISTS comissao_percentual NUMERIC(5,2);

-- ── Produtos ────────────────────────────────────────────────
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS sku            TEXT,
  ADD COLUMN IF NOT EXISTS unidade        TEXT NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS estoque_maximo INTEGER;
