-- ================================================================
--  Múltiplas fotos por produto
-- ================================================================
-- produtos.foto_url continua existindo e é quem todo o resto do
-- sistema usa pra mostrar a miniatura (listagem de Produtos, busca em
-- Vendas/Condicional, detalhe de venda) — ele funciona como a "capa"
-- do produto. produto_fotos guarda a galeria inteira; o front decide
-- qual é a capa e mantém produtos.foto_url sincronizado sempre que a
-- galeria muda (adiciona, remove ou troca a capa), sem precisar mexer
-- em mais nenhuma tela existente.

CREATE TABLE IF NOT EXISTS public.produto_fotos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  empresa_id UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produto_fotos_produto ON public.produto_fotos (produto_id);

ALTER TABLE public.produto_fotos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolada" ON public.produto_fotos;
CREATE POLICY "empresa_isolada" ON public.produto_fotos FOR ALL TO authenticated
  USING (empresa_id = public.minha_empresa()) WITH CHECK (empresa_id = public.minha_empresa());

-- Migra a foto única já cadastrada de cada produto pra galeria, como
-- primeira/única foto (evita perder o que já tinha sido enviado).
INSERT INTO public.produto_fotos (produto_id, url, empresa_id)
SELECT p.id, p.foto_url, p.empresa_id
FROM public.produtos p
WHERE p.foto_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.produto_fotos pf WHERE pf.produto_id = p.id);
