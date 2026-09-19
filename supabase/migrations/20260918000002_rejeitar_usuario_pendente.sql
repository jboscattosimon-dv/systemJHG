-- ================================================================
--  Rejeitar (ou reativar) um login pendente de vinculo com loja
-- ================================================================
-- atualizar_papel_usuario so deixa o super_admin mexer em empresa_id;
-- para "rejeitar" um cadastro que ainda nao tem loja (empresa_id
-- nulo) precisamos poder desativa-lo tambem. Restrito a usuarios
-- SEM loja para nao virar um jeito de super_admin desativar gente
-- que ja pertence a uma loja (isso continua sendo so do gerente).

CREATE OR REPLACE FUNCTION public.definir_ativo_usuario_pendente(
  p_usuario_id UUID,
  p_ativo BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_empresa_atual UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Você não tem permissão para isso.';
  END IF;

  SELECT empresa_id INTO v_empresa_atual FROM public.usuario_perfis WHERE usuario_id = p_usuario_id;
  IF v_empresa_atual IS NOT NULL THEN
    RAISE EXCEPTION 'Esse usuário já está vinculado a uma loja — isso é gerenciado pela loja dele.';
  END IF;

  UPDATE public.usuario_perfis SET ativo = p_ativo WHERE usuario_id = p_usuario_id;
END;
$$;
