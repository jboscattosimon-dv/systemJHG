-- ================================================================
--  Fase 8k (parte 1/3) — funções de permissão de equipe
-- ================================================================
-- super_admin: só liga/desliga o vínculo do usuário com uma loja.
-- administrador OU gerente da própria loja: ajustam papel,
-- profissional vinculado e ativo/inativo de quem já é da loja.

CREATE OR REPLACE FUNCTION public.pode_gerenciar_equipe()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND papel IN ('administrador', 'gerente') AND ativo = true
  );
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
    SET empresa_id = p_empresa_id
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
