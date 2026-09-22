-- ================================================================
--  Foto do produto — coluna + bucket de Storage
-- ================================================================
-- Bucket público "produtos", separado por pasta de empresa
-- (<empresa_id>/<arquivo>) pra manter o isolamento multi-tenant nos
-- uploads. Leitura é pública (a URL da foto precisa funcionar direto
-- no <img src>, sem token); escrita só pra dentro da pasta da própria
-- loja de quem está logado.

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS foto_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('produtos', 'produtos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "produtos_foto_leitura_publica" ON storage.objects;
CREATE POLICY "produtos_foto_leitura_publica" ON storage.objects FOR SELECT
  USING (bucket_id = 'produtos');

DROP POLICY IF EXISTS "produtos_foto_upload_propria_loja" ON storage.objects;
CREATE POLICY "produtos_foto_upload_propria_loja" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'produtos' AND (storage.foldername(name))[1] = public.minha_empresa()::text);

DROP POLICY IF EXISTS "produtos_foto_update_propria_loja" ON storage.objects;
CREATE POLICY "produtos_foto_update_propria_loja" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'produtos' AND (storage.foldername(name))[1] = public.minha_empresa()::text);

DROP POLICY IF EXISTS "produtos_foto_delete_propria_loja" ON storage.objects;
CREATE POLICY "produtos_foto_delete_propria_loja" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'produtos' AND (storage.foldername(name))[1] = public.minha_empresa()::text);
