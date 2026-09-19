-- ================================================================
--  Fase 8b — RLS multi-tenant (isolamento entre lojas)
-- ================================================================
-- A partir daqui, "autenticado" não basta mais - toda tabela
-- operacional exige empresa_id = a loja do usuário logado. O
-- super_admin NÃO enxerga dados operacionais de nenhuma loja (só
-- gerencia empresas e usuários) - isolamento também protege a
-- privacidade dos clientes da plataforma.

CREATE OR REPLACE FUNCTION public.minha_empresa()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT empresa_id FROM public.usuario_perfis WHERE usuario_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND papel = 'super_admin' AND ativo = true
  );
$$;

-- ── empresas ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "empresas_select" ON public.empresas;
CREATE POLICY "empresas_select" ON public.empresas FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.minha_empresa());

DROP POLICY IF EXISTS "empresas_insert" ON public.empresas;
CREATE POLICY "empresas_insert" ON public.empresas FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "empresas_update" ON public.empresas;
CREATE POLICY "empresas_update" ON public.empresas FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "empresas_delete" ON public.empresas;
CREATE POLICY "empresas_delete" ON public.empresas FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ── tabelas operacionais simples: isoladas por empresa ─────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','profissionais','servicos','produtos','agendamentos',
    'comandas','itens_comanda','movimentos_caixa','sessoes_caixa',
    'fornecedores','categorias_financeiras','formas_pagamento',
    'movimentacoes_estoque','profissional_servicos'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "empresa_isolada" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "empresa_isolada" ON public.%I FOR ALL TO authenticated USING (empresa_id = public.minha_empresa()) WITH CHECK (empresa_id = public.minha_empresa())',
      t
    );
  END LOOP;
END $$;

-- ── contas_pagar / contas_receber: empresa + papel financeiro ──
DROP POLICY IF EXISTS "financeiro_gerencia" ON public.contas_pagar;
CREATE POLICY "financeiro_gerencia" ON public.contas_pagar FOR ALL TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "financeiro_gerencia" ON public.contas_receber;
CREATE POLICY "financeiro_gerencia" ON public.contas_receber FOR ALL TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro());

-- ── comissoes: empresa + (financeiro ou dono da comissão) ──────
DROP POLICY IF EXISTS "comissoes_ve_proprias_ou_financeiro" ON public.comissoes;
CREATE POLICY "comissoes_ve_proprias_ou_financeiro" ON public.comissoes FOR SELECT TO authenticated
  USING (
    empresa_id = public.minha_empresa()
    AND (public.pode_gerenciar_financeiro() OR profissional_id = (SELECT profissional_id FROM public.usuario_perfis WHERE usuario_id = auth.uid()))
  );

DROP POLICY IF EXISTS "comissoes_insere_qualquer_autenticado" ON public.comissoes;
CREATE POLICY "comissoes_insere_qualquer_autenticado" ON public.comissoes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa());

DROP POLICY IF EXISTS "comissoes_atualiza_financeiro" ON public.comissoes;
CREATE POLICY "comissoes_atualiza_financeiro" ON public.comissoes FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "comissoes_remove_financeiro" ON public.comissoes;
CREATE POLICY "comissoes_remove_financeiro" ON public.comissoes FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro());

-- ── configuracoes: empresa + leitura geral / edição admin da loja ──
DROP POLICY IF EXISTS "configuracoes_leitura_geral" ON public.configuracoes;
CREATE POLICY "configuracoes_leitura_geral" ON public.configuracoes FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());

DROP POLICY IF EXISTS "configuracoes_insert_admin" ON public.configuracoes;
CREATE POLICY "configuracoes_insert_admin" ON public.configuracoes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.is_admin());

DROP POLICY IF EXISTS "configuracoes_edicao_admin" ON public.configuracoes;
CREATE POLICY "configuracoes_edicao_admin" ON public.configuracoes FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.is_admin())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.is_admin());

-- ── auditoria: empresa + papel financeiro (leitura só) ─────────
DROP POLICY IF EXISTS "auditoria_leitura_financeiro" ON public.auditoria;
CREATE POLICY "auditoria_leitura_financeiro" ON public.auditoria FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro());

-- ── usuario_perfis: super_admin gerencia tudo; administrador de
-- loja só mexe em quem já está na própria loja (não pode "roubar"
-- usuário órfão nem trocar alguém de loja - isso é só do
-- super_admin, via atualizar_papel_usuario) ────────────────────
DROP POLICY IF EXISTS "ve_proprio_perfil_ou_admin" ON public.usuario_perfis;
CREATE POLICY "usuario_perfis_select" ON public.usuario_perfis FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_admin() AND empresa_id = public.minha_empresa())
  );

DROP POLICY IF EXISTS "admin_cria_perfis" ON public.usuario_perfis;
CREATE POLICY "usuario_perfis_insert" ON public.usuario_perfis FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "admin_atualiza_perfis" ON public.usuario_perfis;
CREATE POLICY "usuario_perfis_update" ON public.usuario_perfis FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.is_admin() AND empresa_id = public.minha_empresa()))
  WITH CHECK (public.is_super_admin() OR (public.is_admin() AND empresa_id = public.minha_empresa()));

DROP POLICY IF EXISTS "admin_remove_perfis" ON public.usuario_perfis;
CREATE POLICY "usuario_perfis_delete" ON public.usuario_perfis FOR DELETE TO authenticated
  USING (public.is_super_admin());
