-- ================================================================
--  Fase 8k (parte 3/3) — RLS de usuario_perfis usa pode_gerenciar_equipe()
-- ================================================================

DROP POLICY IF EXISTS "usuario_perfis_select" ON public.usuario_perfis;
CREATE POLICY "usuario_perfis_select" ON public.usuario_perfis FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR public.is_super_admin()
    OR (public.pode_gerenciar_equipe() AND empresa_id = public.minha_empresa())
  );

DROP POLICY IF EXISTS "usuario_perfis_update" ON public.usuario_perfis;
CREATE POLICY "usuario_perfis_update" ON public.usuario_perfis FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.pode_gerenciar_equipe() AND empresa_id = public.minha_empresa()))
  WITH CHECK (public.is_super_admin() OR (public.pode_gerenciar_equipe() AND empresa_id = public.minha_empresa()));
