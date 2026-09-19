-- ================================================================
--  Fase 8g — CORREÇÃO URGENTE: recupera usuario_perfis
-- ================================================================
-- Bug na migration 20260909000001: o TRUNCATE ... CASCADE em
-- profissionais (e outras tabelas) também apagou usuario_perfis por
-- tabela, porque TRUNCATE CASCADE ignora "ON DELETE SET NULL" e
-- simplesmente esvazia qualquer tabela que referencie a truncada -
-- diferente de um DELETE normal, que respeitaria o SET NULL.
--
-- Resultado: todo mundo perdeu o papel de acesso (inclusive
-- super_admin), e como is_admin()/is_super_admin() dependem de ter
-- uma linha em usuario_perfis, ninguém conseguia nem se auto-
-- recuperar pela RPC. Precisa rodar direto aqui.
--
-- Idempotente: seguro rodar de novo.
-- ================================================================

-- Recria um perfil padrão (atendente, sem loja) pra qualquer login
-- que tenha ficado sem linha em usuario_perfis
INSERT INTO public.usuario_perfis (usuario_id, papel, empresa_id)
SELECT au.id, 'atendente', NULL
FROM auth.users au
LEFT JOIN public.usuario_perfis up ON up.usuario_id = au.id
WHERE up.usuario_id IS NULL
ON CONFLICT (usuario_id) DO NOTHING;

-- Restaura você como super administradora
UPDATE public.usuario_perfis
SET papel = 'super_admin', empresa_id = NULL
WHERE usuario_id = (SELECT id FROM auth.users WHERE email = 'adm@dev.com');
