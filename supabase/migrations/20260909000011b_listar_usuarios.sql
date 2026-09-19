-- ================================================================
--  Fase 8k (parte 2/3) — listar_usuarios usa pode_gerenciar_equipe()
-- ================================================================

-- Postgres não deixa mudar o formato de retorno via CREATE OR
-- REPLACE - precisa dropar primeiro (idempotente).
DROP FUNCTION IF EXISTS public.listar_usuarios();

CREATE OR REPLACE FUNCTION public.listar_usuarios()
RETURNS TABLE (
  usuario_id UUID, email TEXT, papel TEXT, profissional_id UUID,
  ativo BOOLEAN, criado_em TIMESTAMPTZ, empresa_id UUID, empresa_nome TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT au.id, au.email, up.papel, up.profissional_id, up.ativo, au.created_at, up.empresa_id, e.nome
  FROM auth.users au
  JOIN public.usuario_perfis up ON up.usuario_id = au.id
  LEFT JOIN public.empresas e ON e.id = up.empresa_id
  WHERE public.is_super_admin() OR (public.pode_gerenciar_equipe() AND up.empresa_id = public.minha_empresa())
  ORDER BY au.created_at;
$$;
