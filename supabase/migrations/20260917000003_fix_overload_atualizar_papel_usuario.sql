-- ================================================================
--  Fix — atualizar_papel_usuario duplicada (overload ambigua)
-- ================================================================
-- Achado na bateria de testes: PGRST203 "Could not choose the best
-- candidate function" ao chamar atualizar_papel_usuario. A migração
-- 20260909000005 adicionou o parâmetro p_empresa_id via
-- CREATE OR REPLACE, mas o Postgres não substitui uma função quando
-- a lista de parâmetros muda — ele cria uma SEGUNDA função (overload).
-- Como os dois parâmetros novos têm DEFAULT, uma chamada com só 4
-- argumentos passa a bater em ambas as versões e o PostgREST não
-- consegue decidir qual usar. Isso quebra TODA troca de papel/equipe
-- em produção agora. Remove a versão antiga (4 parâmetros) e garante
-- que só a versão correta (5 parâmetros, com a trava de papel/loja
-- do gerente) continua existindo.

DROP FUNCTION IF EXISTS public.atualizar_papel_usuario(UUID, TEXT, UUID, BOOLEAN);

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
