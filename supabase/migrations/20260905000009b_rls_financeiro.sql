-- ================================================================
--  Fase 7b — RLS de verdade no financeiro sensível
-- ================================================================
-- Idempotente: todo DROP POLICY IF EXISTS cobre inclusive as
-- policies novas, então rodar de novo depois de um timeout parcial
-- não quebra nada.

CREATE OR REPLACE FUNCTION public.pode_gerenciar_financeiro()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND papel IN ('administrador', 'gerente') AND ativo = true
  );
$$;

DROP POLICY IF EXISTS "auth_all" ON public.contas_pagar;
DROP POLICY IF EXISTS "financeiro_gerencia" ON public.contas_pagar;
CREATE POLICY "financeiro_gerencia" ON public.contas_pagar
  FOR ALL TO authenticated USING (public.pode_gerenciar_financeiro()) WITH CHECK (public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "auth_all" ON public.contas_receber;
DROP POLICY IF EXISTS "financeiro_gerencia" ON public.contas_receber;
CREATE POLICY "financeiro_gerencia" ON public.contas_receber
  FOR ALL TO authenticated USING (public.pode_gerenciar_financeiro()) WITH CHECK (public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "auth_all" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_ve_proprias_ou_financeiro" ON public.comissoes;
CREATE POLICY "comissoes_ve_proprias_ou_financeiro" ON public.comissoes
  FOR SELECT TO authenticated
  USING (
    public.pode_gerenciar_financeiro()
    OR profissional_id = (SELECT profissional_id FROM public.usuario_perfis WHERE usuario_id = auth.uid())
  );

DROP POLICY IF EXISTS "comissoes_insere_qualquer_autenticado" ON public.comissoes;
CREATE POLICY "comissoes_insere_qualquer_autenticado" ON public.comissoes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "comissoes_atualiza_financeiro" ON public.comissoes;
CREATE POLICY "comissoes_atualiza_financeiro" ON public.comissoes
  FOR UPDATE TO authenticated USING (public.pode_gerenciar_financeiro()) WITH CHECK (public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "comissoes_remove_financeiro" ON public.comissoes;
CREATE POLICY "comissoes_remove_financeiro" ON public.comissoes
  FOR DELETE TO authenticated USING (public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "configuracoes_leitura_geral" ON public.configuracoes;
CREATE POLICY "configuracoes_leitura_geral" ON public.configuracoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "configuracoes_edicao_admin" ON public.configuracoes;
CREATE POLICY "configuracoes_edicao_admin" ON public.configuracoes
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "auditoria_leitura_financeiro" ON public.auditoria;
CREATE POLICY "auditoria_leitura_financeiro" ON public.auditoria
  FOR SELECT TO authenticated USING (public.pode_gerenciar_financeiro());
