-- ================================================================
--  Configurações: libera gerente além de administrador
-- ================================================================
-- As policies de INSERT/UPDATE em "configuracoes" exigiam is_admin()
-- (só papel = 'administrador'). Um gerente salvando a tela não dava
-- erro nenhum — o Postgres so filtra a linha via RLS e retorna "0 rows
-- affected" sem lançar exceção, e o supabase-js não reporta isso como
-- erro. Por fora parecia "salvou", mas nada persistia.
--
-- Passa a usar pode_gerenciar_equipe() (administrador OU gerente),
-- mesmo escopo já usado pra gerenciar a equipe/telas permitidas.

DROP POLICY IF EXISTS "configuracoes_insert_admin" ON public.configuracoes;
CREATE POLICY "configuracoes_insert_admin" ON public.configuracoes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_equipe());

DROP POLICY IF EXISTS "configuracoes_edicao_admin" ON public.configuracoes;
CREATE POLICY "configuracoes_edicao_admin" ON public.configuracoes FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_equipe())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_equipe());
