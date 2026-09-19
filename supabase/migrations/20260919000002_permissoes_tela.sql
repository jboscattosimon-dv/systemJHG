-- ================================================================
--  Permissões de tela por usuário (gerente configura o que a
--  equipe enxerga)
-- ================================================================
-- telas_permitidas = NULL significa "sem restrição" (vê tudo, é o
-- comportamento de sempre — ninguém existente perde acesso). Quando
-- preenchido, é a lista exata de telas (mesma chave da rota, sem a
-- barra: 'clientes', 'produtos', etc.) que aquele usuário enxerga no
-- menu e consegue abrir direto pela URL. O Dashboard nunca é
-- restringível (é a home depois do login).
--
-- Só se aplica de verdade a usuários com papel 'gerente' — é uma
-- curadoria de UI, não um novo nível de RLS (quem já não tinha
-- permissão pra ver o dado continua sem ver, mesmo com a tela
-- "liberada" aqui).

ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS telas_permitidas TEXT[];

DROP FUNCTION IF EXISTS public.listar_usuarios();
CREATE OR REPLACE FUNCTION public.listar_usuarios()
RETURNS TABLE (
  usuario_id UUID, email TEXT, papel TEXT, profissional_id UUID,
  ativo BOOLEAN, criado_em TIMESTAMPTZ, empresa_id UUID, empresa_nome TEXT,
  telas_permitidas TEXT[]
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT au.id, au.email, up.papel, up.profissional_id, up.ativo, au.created_at, up.empresa_id, e.nome, up.telas_permitidas
  FROM auth.users au
  JOIN public.usuario_perfis up ON up.usuario_id = au.id
  LEFT JOIN public.empresas e ON e.id = up.empresa_id
  WHERE public.is_super_admin() OR (public.pode_gerenciar_equipe() AND up.empresa_id = public.minha_empresa())
  ORDER BY au.created_at;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_telas_permitidas(
  p_usuario_id UUID,
  p_telas      TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_alvo UUID;
  v_papel_alvo   TEXT;
BEGIN
  IF NOT public.pode_gerenciar_equipe() THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar permissões de tela.';
  END IF;

  SELECT empresa_id, papel INTO v_empresa_alvo, v_papel_alvo
  FROM public.usuario_perfis WHERE usuario_id = p_usuario_id;

  IF v_empresa_alvo IS NULL OR v_empresa_alvo <> public.minha_empresa() THEN
    RAISE EXCEPTION 'Usuário não pertence à sua loja.';
  END IF;

  IF v_papel_alvo <> 'gerente' THEN
    RAISE EXCEPTION 'Permissões de tela só se aplicam a usuários com papel gerente.';
  END IF;

  UPDATE public.usuario_perfis SET telas_permitidas = p_telas WHERE usuario_id = p_usuario_id;
END;
$$;
