-- ================================================================
--  Categorias financeiras
-- ================================================================
-- Base para o módulo financeiro (contas a pagar/receber, DRE,
-- fluxo de caixa). Cada categoria é de receita ou despesa e pode
-- ter uma categoria-pai para permitir agrupamento em relatórios.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.categorias_financeiras (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               TEXT NOT NULL,
  tipo               TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria_pai_id   UUID REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL,
  ativo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nome, tipo)
);

CREATE INDEX IF NOT EXISTS idx_categorias_financeiras_tipo ON public.categorias_financeiras (tipo);

ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON public.categorias_financeiras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.categorias_financeiras (nome, tipo) VALUES
  ('Serviços',              'receita'),
  ('Produtos',               'receita'),
  ('Outras receitas',        'receita'),
  ('Aluguel',                'despesa'),
  ('Energia',                'despesa'),
  ('Água',                   'despesa'),
  ('Internet',               'despesa'),
  ('Salários',               'despesa'),
  ('Comissões',              'despesa'),
  ('Pró-labore',             'despesa'),
  ('Produtos para revenda',  'despesa'),
  ('Materiais',              'despesa'),
  ('Marketing',              'despesa'),
  ('Sistemas',               'despesa'),
  ('Impostos',               'despesa'),
  ('Manutenção',             'despesa'),
  ('Outras despesas',        'despesa')
ON CONFLICT (nome, tipo) DO NOTHING;
