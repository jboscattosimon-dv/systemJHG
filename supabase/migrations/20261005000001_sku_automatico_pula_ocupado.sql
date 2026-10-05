-- ================================================================
--  SKU automático pula número que já está em uso
-- ================================================================
-- O contador empresas.proximo_sku_sequencial (20260928000001) só
-- avança, sem olhar se o número já foi usado por um SKU digitado à mão
-- ou vindo de planilha (ex.: produto cadastrado com SKU "112" antes do
-- contador chegar lá). Quando o contador alcançava esse número, o
-- INSERT batia no índice único idx_produtos_sku_unico_por_empresa e a
-- importação inteira falhava com "duplicate key value".
--
-- Agora o trigger continua avançando o contador até achar um número
-- livre. O UPDATE em empresas trava a linha da loja, então dois
-- cadastros simultâneos não pegam o mesmo número.

CREATE OR REPLACE FUNCTION public.gerar_sku_automatico()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_proximo INTEGER;
BEGIN
  IF NEW.sku IS NULL OR trim(NEW.sku) = '' THEN
    LOOP
      UPDATE public.empresas
      SET proximo_sku_sequencial = COALESCE(proximo_sku_sequencial, 1) + 1
      WHERE id = NEW.empresa_id
      RETURNING proximo_sku_sequencial - 1 INTO v_proximo;

      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.produtos
        WHERE empresa_id = NEW.empresa_id AND sku = v_proximo::TEXT
      );
    END LOOP;
    NEW.sku := v_proximo::TEXT;
  END IF;
  RETURN NEW;
END;
$$;
