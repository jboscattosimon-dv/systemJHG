-- ================================================================
--  Fase 8e — RPCs de usuários multi-tenant
-- ================================================================
-- listar_usuarios: super_admin vê todo mundo (com nome da loja);
-- administrador de loja vê só o pessoal da própria loja.
--
-- atualizar_papel_usuario: super_admin pode tudo, inclusive vincular
-- um usuário "órfão" (empresa_id nulo, acabou de se cadastrar) a uma
-- loja. Administrador de loja só mexe em quem já é da própria loja,
-- não pode trocar de loja nem conceder super_admin.

-- Postgres não deixa trocar o formato de retorno de uma função TABLE
-- via CREATE OR REPLACE - precisa dropar primeiro (idempotente).
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
  WHERE public.is_super_admin() OR (public.is_admin() AND up.empresa_id = public.minha_empresa())
  ORDER BY au.created_at;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_papel_usuario(
  p_usuario_id UUID,
  p_papel TEXT,
  p_profissional_id UUID DEFAULT NULL,
  p_ativo BOOLEAN DEFAULT TRUE,
  p_empresa_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_alvo UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_alvo FROM public.usuario_perfis WHERE usuario_id = p_usuario_id;

  IF public.is_super_admin() THEN
    UPDATE public.usuario_perfis
    SET papel = p_papel,
        profissional_id = p_profissional_id,
        ativo = p_ativo,
        empresa_id = COALESCE(p_empresa_id, empresa_id)
    WHERE usuario_id = p_usuario_id;
  ELSIF public.is_admin() AND v_empresa_alvo IS NOT NULL AND v_empresa_alvo = public.minha_empresa() THEN
    IF p_papel = 'super_admin' THEN
      RAISE EXCEPTION 'Apenas super administradores podem conceder esse papel.';
    END IF;
    UPDATE public.usuario_perfis
    SET papel = p_papel, profissional_id = p_profissional_id, ativo = p_ativo
    WHERE usuario_id = p_usuario_id;
  ELSE
    RAISE EXCEPTION 'Você não tem permissão para alterar esse usuário.';
  END IF;
END;
$$;
