-- ================================================================
--  Limpeza do schema legado
-- ================================================================
-- O projeto teve uma primeira tentativa de modelagem (empresas,
-- perfis, usuarios, funcionarios, atendimentos, comissoes, caixas)
-- que foi abandonada em favor do schema atual, iniciado em
-- 20260622000001_schema_inicial.sql (profissionais, clientes,
-- servicos, produtos, agendamentos, comandas, itens_comanda,
-- movimentos_caixa).
--
-- Nenhuma dessas tabelas antigas é referenciada em nenhum lugar do
-- frontend. Esta migration remove qualquer resquício delas do
-- banco, caso alguma tenha chegado a ser aplicada manualmente.
--
-- Idempotente: seguro rodar mesmo que essas tabelas nunca tenham
-- existido no seu projeto Supabase.
-- ================================================================

DROP TABLE IF EXISTS public.usuarios      CASCADE;
DROP TABLE IF EXISTS public.perfis        CASCADE;
DROP TABLE IF EXISTS public.comissoes     CASCADE;
DROP TABLE IF EXISTS public.atendimentos  CASCADE;
DROP TABLE IF EXISTS public.caixas        CASCADE;
DROP TABLE IF EXISTS public.funcionarios  CASCADE;
DROP TABLE IF EXISTS public.empresas      CASCADE;

DROP FUNCTION IF EXISTS public.update_atuali_em() CASCADE;
