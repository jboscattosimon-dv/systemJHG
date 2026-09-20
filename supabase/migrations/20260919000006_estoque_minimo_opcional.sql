-- ================================================================
--  Estoque mínimo vira opcional (sem padrão forçado de 5)
-- ================================================================
-- Produto sem estoque mínimo definido fica NULL de verdade — não
-- assume mais 5 escondido. Não mexe no valor de produtos que já
-- tinham algo definido.

ALTER TABLE public.produtos ALTER COLUMN estoque_minimo DROP DEFAULT;
ALTER TABLE public.produtos ALTER COLUMN estoque_minimo DROP NOT NULL;
