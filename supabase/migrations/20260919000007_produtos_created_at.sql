-- ================================================================
--  Data de cadastro do produto (pra filtrar relatório por período)
-- ================================================================
-- Produto não tinha created_at — o relatório de Produtos não tinha
-- como saber quando cada um foi cadastrado pra aplicar o filtro de
-- período que o resto do sistema já usa. Produtos que já existem
-- ganham a data de hoje (não tem como recuperar a data real).

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
