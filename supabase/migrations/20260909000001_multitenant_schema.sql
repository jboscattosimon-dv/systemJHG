-- ================================================================
--  Fase 8a — Multi-tenant: empresas + empresa_id em tudo
-- ================================================================
-- Combinado com a usuária: os dados operacionais atuais (clientes,
-- produtos, vendas, etc. da barbearia de teste) são zerados aqui -
-- o sistema vira multi-loja e cada loja parte do zero. As contas de
-- login (auth.users/usuario_perfis) NÃO são apagadas.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.empresas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  cnpj       TEXT,
  telefone   TEXT,
  email      TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Zera os dados operacionais (mantém cadastros de login intactos).
-- Usa DELETE em vez de TRUNCATE ... CASCADE de propósito: TRUNCATE
-- CASCADE ignora "ON DELETE SET NULL" e simplesmente esvazia
-- qualquer tabela que referencie as listadas - incluindo
-- usuario_perfis (que referencia profissionais), apagando o papel
-- de acesso de todo mundo. DELETE respeita SET NULL corretamente.
DELETE FROM public.itens_comanda;
DELETE FROM public.comandas;
DELETE FROM public.movimentos_caixa;
DELETE FROM public.movimentacoes_estoque;
DELETE FROM public.comissoes;
DELETE FROM public.contas_pagar;
DELETE FROM public.contas_receber;
DELETE FROM public.agendamentos;
DELETE FROM public.profissional_servicos;
DELETE FROM public.sessoes_caixa;
DELETE FROM public.auditoria;
DELETE FROM public.produtos;
DELETE FROM public.servicos;
DELETE FROM public.clientes;
DELETE FROM public.profissionais;
DELETE FROM public.fornecedores;
DELETE FROM public.categorias_financeiras;
DELETE FROM public.formas_pagamento;

-- empresa_id em toda tabela operacional
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','profissionais','servicos','produtos','agendamentos',
    'comandas','itens_comanda','movimentos_caixa','sessoes_caixa',
    'contas_pagar','contas_receber','comissoes','fornecedores',
    'categorias_financeiras','formas_pagamento','movimentacoes_estoque',
    'profissional_servicos','auditoria'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_empresa ON public.%I (empresa_id)', t, t);
  END LOOP;
END $$;

-- Como as tabelas estão vazias agora, já podemos exigir empresa_id
-- (menos auditoria, que fica opcional por enquanto)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','profissionais','servicos','produtos','agendamentos',
    'comandas','itens_comanda','movimentos_caixa','sessoes_caixa',
    'contas_pagar','contas_receber','comissoes','fornecedores',
    'categorias_financeiras','formas_pagamento','movimentacoes_estoque',
    'profissional_servicos'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN empresa_id SET NOT NULL', t);
  END LOOP;
END $$;

-- usuario_perfis: vincula usuário a uma loja + novo papel super_admin
-- (empresa_id fica nulo até alguém vincular - é o estado "usuário
-- cadastrado, esperando ser colocado numa loja")
ALTER TABLE public.usuario_perfis
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL;

ALTER TABLE public.usuario_perfis DROP CONSTRAINT IF EXISTS usuario_perfis_papel_check;
ALTER TABLE public.usuario_perfis ADD CONSTRAINT usuario_perfis_papel_check
  CHECK (papel IN ('super_admin','administrador','gerente','atendente','profissional'));

-- configuracoes deixa de ser uma linha única global e vira uma por loja
DROP TABLE IF EXISTS public.configuracoes CASCADE;
CREATE TABLE public.configuracoes (
  empresa_id            UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_empresa          TEXT NOT NULL DEFAULT 'Minha Barbearia',
  cnpj                  TEXT,
  telefone              TEXT,
  endereco              TEXT,
  logo_url              TEXT,
  horario_abertura      TIME NOT NULL DEFAULT '08:00',
  horario_fechamento    TIME NOT NULL DEFAULT '20:00',
  duracao_padrao_min    INTEGER NOT NULL DEFAULT 30,
  tolerancia_atraso_min INTEGER NOT NULL DEFAULT 10,
  regras_cancelamento   TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Você (adm@dev.com) vira a super administradora da plataforma,
-- sem loja própria por padrão - cria as lojas clientes pelo portal.
UPDATE public.usuario_perfis
SET papel = 'super_admin', empresa_id = NULL
WHERE usuario_id = (SELECT id FROM auth.users WHERE email = 'adm@dev.com');
