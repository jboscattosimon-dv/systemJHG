-- ================================================================
--  Super admin também pode configurar permissões de tela
-- ================================================================
-- pode_gerenciar_equipe() só reconhece 'administrador' e 'gerente' —
-- super_admin caía direto na exceção "sem permissão", mesmo sendo quem
-- mais deveria poder. Segue o mesmo padrão de atualizar_papel_usuario:
-- super_admin passa liberado (qualquer loja), administrador/gerente só
-- dentro da própria loja.

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
  IF public.is_super_admin() THEN
    UPDATE public.usuario_perfis SET telas_permitidas = p_telas WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

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
