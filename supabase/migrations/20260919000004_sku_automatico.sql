-- ================================================================
--  SKU automático (sequência numérica por loja: 1, 2, 3, ...)
-- ================================================================
-- Se o produto for criado sem SKU informado — cadastro manual ou
-- importação de planilha — gera automaticamente o próximo número da
-- sequência da loja (maior SKU numérico já usado + 1). Produto que
-- já vem com SKU informado não é mexido.
--
-- Fica num trigger (não em cada tela/RPC) pra cobrir os dois
-- caminhos de criação de produto de uma vez só: o formulário manual
-- em Produtos.tsx e o importar_produtos (importação em lote).

CREATE OR REPLACE FUNCTION public.gerar_sku_automatico()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_proximo INTEGER;
BEGIN
  IF NEW.sku IS NULL OR trim(NEW.sku) = '' THEN
    SELECT COALESCE(MAX(sku::INTEGER), 0) + 1 INTO v_proximo
    FROM public.produtos
    WHERE empresa_id = NEW.empresa_id AND sku ~ '^[0-9]+$';
    NEW.sku := v_proximo::TEXT;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_sku_automatico ON public.produtos;
CREATE TRIGGER trg_gerar_sku_automatico
  BEFORE INSERT ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.gerar_sku_automatico();
