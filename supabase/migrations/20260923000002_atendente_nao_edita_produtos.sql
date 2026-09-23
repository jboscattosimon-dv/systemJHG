-- ================================================================
--  Atendente não edita produtos (defesa em profundidade)
-- ================================================================
-- A tela já esconde os botões de editar/criar/importar produto,
-- trocar foto e mudar preço pra quem é atendente, mas até aqui a
-- política de RLS de produtos/produto_tamanhos/produto_fotos era
-- "empresa_isolada" (FOR ALL, sem checar papel) — ou seja, um
-- atendente ainda conseguiria escrever direto via API/DevTools.
-- Aqui a leitura continua igual pra todo mundo da loja, e só
-- escrita (insert/update/delete) passa a exigir papel != atendente.
-- RPCs internas (finalizar_venda, fechar_condicional, entrada de
-- mercadoria etc.) continuam funcionando normalmente porque rodam
-- como SECURITY DEFINER, que não é afetado por RLS.

CREATE OR REPLACE FUNCTION public.pode_gerenciar_produtos()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND papel <> 'atendente' AND ativo = true
  );
$$;

-- produtos
DROP POLICY IF EXISTS "empresa_isolada" ON public.produtos;
DROP POLICY IF EXISTS "produtos_select" ON public.produtos;
DROP POLICY IF EXISTS "produtos_insert" ON public.produtos;
DROP POLICY IF EXISTS "produtos_update" ON public.produtos;
DROP POLICY IF EXISTS "produtos_delete" ON public.produtos;

CREATE POLICY "produtos_select" ON public.produtos FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());
CREATE POLICY "produtos_insert" ON public.produtos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produtos_update" ON public.produtos FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produtos_delete" ON public.produtos FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());

-- produto_tamanhos
DROP POLICY IF EXISTS "empresa_isolada" ON public.produto_tamanhos;
DROP POLICY IF EXISTS "produto_tamanhos_select" ON public.produto_tamanhos;
DROP POLICY IF EXISTS "produto_tamanhos_insert" ON public.produto_tamanhos;
DROP POLICY IF EXISTS "produto_tamanhos_update" ON public.produto_tamanhos;
DROP POLICY IF EXISTS "produto_tamanhos_delete" ON public.produto_tamanhos;

CREATE POLICY "produto_tamanhos_select" ON public.produto_tamanhos FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());
CREATE POLICY "produto_tamanhos_insert" ON public.produto_tamanhos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produto_tamanhos_update" ON public.produto_tamanhos FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produto_tamanhos_delete" ON public.produto_tamanhos FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());

-- produto_fotos
DROP POLICY IF EXISTS "empresa_isolada" ON public.produto_fotos;
DROP POLICY IF EXISTS "produto_fotos_select" ON public.produto_fotos;
DROP POLICY IF EXISTS "produto_fotos_insert" ON public.produto_fotos;
DROP POLICY IF EXISTS "produto_fotos_update" ON public.produto_fotos;
DROP POLICY IF EXISTS "produto_fotos_delete" ON public.produto_fotos;

CREATE POLICY "produto_fotos_select" ON public.produto_fotos FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());
CREATE POLICY "produto_fotos_insert" ON public.produto_fotos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produto_fotos_update" ON public.produto_fotos FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produto_fotos_delete" ON public.produto_fotos FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
