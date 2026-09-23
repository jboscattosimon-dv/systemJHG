-- ================================================================
--  Lista simples de usuários da loja (só id + e-mail), pra exibir
--  "quem fez" em telas como Condicionais — sem os campos sensíveis
--  de listar_usuarios (papel, ativo, telas_permitidas) e sem exigir
--  ser admin/gerente pra chamar, já que qualquer papel pode
--  precisar ver de quem é um condicional.
-- ================================================================

CREATE OR REPLACE FUNCTION public.listar_usuarios_basico()
RETURNS TABLE (usuario_id UUID, email TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT au.id, au.email
  FROM auth.users au
  JOIN public.usuario_perfis up ON up.usuario_id = au.id
  WHERE up.empresa_id = public.minha_empresa();
$$;
