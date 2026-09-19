-- ================================================================
--  BarberOS ERP — Schema Inicial
--  Barbearia + Conveniência (Pub/Lounge)
-- ================================================================

-- ── Profissionais (Barbeiros) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profissionais (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 TEXT NOT NULL,
  especialidade        TEXT NOT NULL DEFAULT 'Barbeiro',
  comissao_percentual  NUMERIC(5,2) NOT NULL DEFAULT 50,
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  telefone             TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Clientes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  telefone   TEXT NOT NULL,
  email      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Serviços ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.servicos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT NOT NULL,
  preco            NUMERIC(10,2) NOT NULL,
  duracao_minutos  INTEGER NOT NULL DEFAULT 30,
  ativo            BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── Produtos (Conveniência) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.produtos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  categoria       TEXT NOT NULL CHECK (categoria IN ('bebidas', 'pomadas', 'petiscos', 'outros')),
  preco_custo     NUMERIC(10,2) NOT NULL DEFAULT 0,
  preco_venda     NUMERIC(10,2) NOT NULL,
  estoque_atual   INTEGER NOT NULL DEFAULT 0,
  estoque_minimo  INTEGER NOT NULL DEFAULT 5,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── Agendamentos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agendamentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  profissional_id  UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  servico_id       UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
  data_hora        TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente', 'confirmado', 'concluido', 'cancelado')),
  observacoes      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Comandas (PDV) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comandas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome     TEXT,
  data             DATE NOT NULL DEFAULT CURRENT_DATE,
  status           TEXT NOT NULL DEFAULT 'aberta'
                     CHECK (status IN ('aberta', 'fechada', 'cancelada')),
  total            NUMERIC(10,2) NOT NULL DEFAULT 0,
  forma_pagamento  TEXT CHECK (forma_pagamento IN ('pix', 'credito', 'debito', 'dinheiro')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Itens de Comanda ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.itens_comanda (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id       UUID NOT NULL REFERENCES public.comandas(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL CHECK (tipo IN ('servico', 'produto')),
  referencia_id    UUID NOT NULL,
  nome             TEXT NOT NULL,
  quantidade       INTEGER NOT NULL DEFAULT 1,
  preco_unitario   NUMERIC(10,2) NOT NULL,
  profissional_id  UUID REFERENCES public.profissionais(id) ON DELETE SET NULL
);

-- ── Movimentos de Caixa ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.movimentos_caixa (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria   TEXT NOT NULL,
  descricao   TEXT NOT NULL,
  valor       NUMERIC(10,2) NOT NULL,
  data        DATE NOT NULL DEFAULT CURRENT_DATE,
  comanda_id  UUID REFERENCES public.comandas(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agendamentos_data     ON public.agendamentos (data_hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_profissional ON public.agendamentos (profissional_id);
CREATE INDEX IF NOT EXISTS idx_comandas_data         ON public.comandas (data);
CREATE INDEX IF NOT EXISTS idx_movimentos_data       ON public.movimentos_caixa (data);

-- ── Dados de Exemplo ────────────────────────────────────────
INSERT INTO public.profissionais (nome, especialidade, comissao_percentual, telefone) VALUES
  ('João Silva',   'Cabelo e Barba', 50, '(11) 99111-2233'),
  ('Pedro Santos', 'Coloração',      55, '(11) 99444-5566'),
  ('Lucas Costa',  'Sênior',         60, '(11) 99777-8899')
ON CONFLICT DO NOTHING;

INSERT INTO public.servicos (nome, preco, duracao_minutos) VALUES
  ('Combo Cabelo + Barba', 65,  50),
  ('Corte de Cabelo',      45,  30),
  ('Barba',                30,  20),
  ('Pigmentação',          80,  60),
  ('Sobrancelha',          15,  10)
ON CONFLICT DO NOTHING;

INSERT INTO public.produtos (nome, categoria, preco_custo, preco_venda, estoque_atual, estoque_minimo) VALUES
  ('Heineken Lata',   'bebidas',  4.00,  8.00,  24, 12),
  ('Skol Lata',       'bebidas',  3.50,  7.00,  18, 12),
  ('Água Mineral',    'bebidas',  1.50,  4.00,  30, 10),
  ('Pomada Uppercut', 'pomadas',  25.00, 55.00,  8,  3),
  ('Pomada Leve',     'pomadas',  18.00, 38.00,  6,  3),
  ('Petisco Misto',   'petiscos',  8.00, 18.00, 15,  5),
  ('Batata Chips',    'petiscos',  5.00, 12.00, 20,  5)
ON CONFLICT DO NOTHING;

-- ── RLS (Row Level Security) ─────────────────────────────────
ALTER TABLE public.profissionais    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comandas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_comanda    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentos_caixa ENABLE ROW LEVEL SECURITY;

-- Policies: usuários autenticados têm acesso total
CREATE POLICY "auth_all" ON public.profissionais    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.clientes         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.servicos         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.produtos         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.agendamentos     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.comandas         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.itens_comanda    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON public.movimentos_caixa FOR ALL TO authenticated USING (true) WITH CHECK (true);
