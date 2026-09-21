-- ================================================================
--  Permissões de tela agora valem pra qualquer papel, não só gerente
-- ================================================================
-- Antes só dava pra configurar telas_permitidas de usuários 'gerente'.
-- Passa a valer pra qualquer papel da loja (menos super_admin, que nem
-- pertence a uma empresa — já barrado pela checagem de empresa abaixo).

CREATE OR REPLACE FUNCTION public.atualizar_telas_permitidas(
  p_usuario_id UUID,
  p_telas      TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_alvo UUID;
BEGIN
  IF NOT public.pode_gerenciar_equipe() THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar permissões de tela.';
  END IF;

  SELECT empresa_id INTO v_empresa_alvo
  FROM public.usuario_perfis WHERE usuario_id = p_usuario_id;

  IF v_empresa_alvo IS NULL OR v_empresa_alvo <> public.minha_empresa() THEN
    RAISE EXCEPTION 'Usuário não pertence à sua loja.';
  END IF;

  UPDATE public.usuario_perfis SET telas_permitidas = p_telas WHERE usuario_id = p_usuario_id;
END;
$$;
