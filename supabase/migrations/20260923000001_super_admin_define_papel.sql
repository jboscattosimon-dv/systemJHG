-- ================================================================
--  Super admin também define papel (gerente/atendente/etc) ao
--  vincular ou editar um usuário, não só empresa_id
-- ================================================================
-- Até aqui, quando quem chamava atualizar_papel_usuario era o
-- super_admin, a função só atualizava empresa_id (vincular/
-- desvincular da loja) e ignorava silenciosamente p_papel,
-- p_profissional_id e p_ativo. Isso obrigava o super_admin a
-- vincular o usuário primeiro e depois pedir pro gerente da loja
-- ajustar o papel. Agora o super_admin também define esses campos
-- na mesma chamada.

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
    SET empresa_id = p_empresa_id, papel = p_papel, profissional_id = p_profissional_id, ativo = p_ativo
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  IF public.pode_gerenciar_equipe() AND v_empresa_alvo IS NOT NULL AND v_empresa_alvo = public.minha_empresa() THEN
    IF p_papel = 'super_admin' THEN
      RAISE EXCEPTION 'Você não tem permissão para conceder esse papel.';
    END IF;
    UPDATE public.usuario_perfis
    SET papel = p_papel, profissional_id = p_profissional_id, ativo = p_ativo
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Você não tem permissão para alterar esse usuário.';
END;
$$;
