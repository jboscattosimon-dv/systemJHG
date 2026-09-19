-- ================================================================
--  Codigo unico por loja + vinculo de usuarios centrado na empresa
-- ================================================================
-- Cada loja passa a ter um codigo curto e unico (ex: 4F2A-9B1C),
-- gerado automaticamente. Usado no painel do super_admin pra achar
-- a loja certa rapido e como referencia pra passar pro dono da loja.

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS codigo TEXT UNIQUE;

CREATE OR REPLACE FUNCTION public.gerar_codigo_empresa()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)
    || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.set_codigo_empresa()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    LOOP
      NEW.codigo := public.gerar_codigo_empresa();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.empresas WHERE codigo = NEW.codigo);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_codigo_empresa ON public.empresas;
CREATE TRIGGER trg_set_codigo_empresa
  BEFORE INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_codigo_empresa();

-- Preenche o código das lojas que já existiam antes desta migração.
DO $$
DECLARE r RECORD; v_codigo TEXT;
BEGIN
  FOR r IN SELECT id FROM public.empresas WHERE codigo IS NULL LOOP
    LOOP
      v_codigo := public.gerar_codigo_empresa();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.empresas WHERE codigo = v_codigo);
    END LOOP;
    UPDATE public.empresas SET codigo = v_codigo WHERE id = r.id;
  END LOOP;
END $$;
