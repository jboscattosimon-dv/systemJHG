-- ================================================================
--  Corrige trigger de novo usuário (schema legado)
-- ================================================================
-- trg_new_user (em auth.users) chamava handle_new_user(), que
-- inseria em public.perfis (usuari_pe, nome_pe) - tabela do schema
-- antigo, removida na Fase 1 (20260904000001_cleanup_legacy_schema).
-- Como o trigger sobreviveu à limpeza (ele fica em auth.users, não
-- na tabela removida), toda criação de usuário passou a falhar com
-- "Database error creating new user".
--
-- Aponta o trigger pra tabela atual (usuario_perfis). Novo usuário
-- entra como 'atendente' por padrão (menor privilégio) - promover a
-- administrador/gerente é uma ação separada, deliberada.
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuario_perfis (usuario_id, papel)
  VALUES (NEW.id, 'atendente')
  ON CONFLICT (usuario_id) DO NOTHING;
  RETURN NEW;
END;
$$;
