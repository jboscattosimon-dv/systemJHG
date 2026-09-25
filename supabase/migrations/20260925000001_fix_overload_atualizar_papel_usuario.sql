-- ================================================================
--  Fix — atualizar_papel_usuario duplicada (overload ambígua)
-- ================================================================
-- A migração de comissão por usuário adicionou p_comissao_percentual
-- via CREATE OR REPLACE, mas o Postgres não substitui uma função
-- quando a lista de parâmetros muda — ele cria uma SEGUNDA função
-- (overload). Uma chamada com só os 5 parâmetros antigos (como
-- EmpresaDetalhe.tsx ao vincular um usuário pendente) passa a bater
-- em ambas as versões e o PostgREST não consegue decidir qual usar
-- (erro PGRST203). Remove a versão antiga (5 parâmetros) e garante
-- que só a versão com comissão (6 parâmetros) continua existindo.

DROP FUNCTION IF EXISTS public.atualizar_papel_usuario(UUID, TEXT, UUID, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION public.atualizar_papel_usuario(
  p_usuario_id UUID,
  p_papel TEXT,
  p_profissional_id UUID DEFAULT NULL,
  p_ativo BOOLEAN DEFAULT TRUE,
  p_empresa_id UUID DEFAULT NULL,
  p_comissao_percentual NUMERIC DEFAULT NULL
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
    SET empresa_id = p_empresa_id, papel = p_papel, profissional_id = p_profissional_id,
        ativo = p_ativo, comissao_percentual = p_comissao_percentual
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  IF public.pode_gerenciar_equipe() AND v_empresa_alvo IS NOT NULL AND v_empresa_alvo = public.minha_empresa() THEN
    IF p_papel = 'super_admin' THEN
      RAISE EXCEPTION 'Você não tem permissão para conceder esse papel.';
    END IF;
    UPDATE public.usuario_perfis
    SET papel = p_papel, profissional_id = p_profissional_id, ativo = p_ativo,
        comissao_percentual = p_comissao_percentual
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Você não tem permissão para alterar esse usuário.';
END;
$$;
