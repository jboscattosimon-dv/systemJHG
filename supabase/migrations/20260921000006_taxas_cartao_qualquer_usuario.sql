-- ================================================================
--  Taxas de cartão: qualquer usuário da loja pode editar
-- ================================================================
-- A policy de edição exigia pode_gerenciar_financeiro() (só
-- administrador/gerente) e batia em RLS ao tentar cadastrar. A pedido:
-- quem tem acesso à tela de Configurações já pode editar, sem exigir
-- um papel específico — só precisa ser da mesma loja.

DROP POLICY IF EXISTS "taxas_cartao_leitura_loja" ON public.taxas_cartao_parcelado;
DROP POLICY IF EXISTS "taxas_cartao_edicao_financeiro" ON public.taxas_cartao_parcelado;

CREATE POLICY "taxas_cartao_acesso_loja" ON public.taxas_cartao_parcelado
  FOR ALL TO authenticated
  USING (empresa_id = public.minha_empresa())
  WITH CHECK (empresa_id = public.minha_empresa());
