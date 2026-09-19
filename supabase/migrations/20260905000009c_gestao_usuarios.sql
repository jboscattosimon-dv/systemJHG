-- ================================================================
--  Fase 7c — RPCs de gestão de usuários (tela Administração)
-- ================================================================

CREATE OR REPLACE FUNCTION public.listar_usuarios()
RETURNS TABLE (usuario_id UUID, email TEXT, papel TEXT, profissional_id UUID, ativo BOOLEAN, criado_em TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT au.id, au.email, up.papel, up.profissional_id, up.ativo, au.created_at
  FROM auth.users au
  JOIN public.usuario_perfis up ON up.usuario_id = au.id
  WHERE public.is_admin()
  ORDER BY au.created_at;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_papel_usuario(p_usuario_id UUID, p_papel TEXT, p_profissional_id UUID DEFAULT NULL, p_ativo BOOLEAN DEFAULT TRUE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papéis de usuário.';
  END IF;
  UPDATE public.usuario_perfis
  SET papel = p_papel, profissional_id = p_profissional_id, ativo = p_ativo
  WHERE usuario_id = p_usuario_id;
END;
$$;
