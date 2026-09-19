-- ================================================================
--  Usuários e perfis (fundação de RBAC)
-- ================================================================
-- Estende auth.users com um papel de acesso. Não substitui ainda
-- as policies "auth_all" das tabelas operacionais (agenda, PDV,
-- financeiro etc.) — isso é enforcement de verdade e fica para a
-- fase de Administração/RLS, para não travar o uso atual do
-- sistema sem antes termos telas de gestão de usuário. Esta
-- migração cria só a estrutura e já protege a si mesma (só admin
-- gerencia papéis de outros usuários).
--
-- Todo usuário já existente em auth.users vira 'administrador'
-- automaticamente ao rodar esta migração, preservando o acesso
-- atual de quem já usa o sistema.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.usuario_perfis (
  usuario_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  papel            TEXT NOT NULL DEFAULT 'administrador'
                     CHECK (papel IN ('administrador', 'gerente', 'atendente', 'profissional')),
  profissional_id  UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.usuario_perfis ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER: permite checar o papel do usuário dentro de
-- policies de outras tabelas sem recursão de RLS sobre esta própria
-- tabela.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND papel = 'administrador' AND ativo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.meu_papel()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT papel FROM public.usuario_perfis WHERE usuario_id = auth.uid() AND ativo = true;
$$;

CREATE POLICY "ve_proprio_perfil_ou_admin" ON public.usuario_perfis
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.is_admin());

CREATE POLICY "admin_cria_perfis" ON public.usuario_perfis
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_atualiza_perfis" ON public.usuario_perfis
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "admin_remove_perfis" ON public.usuario_perfis
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Bootstrap: todo usuário que já existe hoje vira administrador.
INSERT INTO public.usuario_perfis (usuario_id, papel)
SELECT id, 'administrador' FROM auth.users
ON CONFLICT (usuario_id) DO NOTHING;
