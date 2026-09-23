-- ================================================================
--  Timezone do banco para America/Sao_Paulo
-- ================================================================
-- Causa raiz do "nota de ontem aparecendo como hoje": todo campo
-- DATE com DEFAULT CURRENT_DATE (movimentos_caixa.data, comandas.data
-- etc.) é preenchido usando o timezone da sessão do banco, que por
-- padrão é UTC. Como o Brasil está 3h atrás do UTC, qualquer registro
-- feito entre ~21h e 23h59 (horário de Brasília) cai depois da meia-
-- noite em UTC — o banco entende que já é o dia seguinte e grava a
-- data errada (um dia à frente do dia real da loja).
--
-- Isso também combinava com um bug separado no front (já corrigido
-- em src/lib/utils.ts: formatDate interpretava "YYYY-MM-DD" como
-- meia-noite UTC e ao exibir no fuso local "voltava" um dia) — a
-- combinação dos dois fazia uma nota de hoje, gravada errada como
-- amanhã, aparecer na tela como se fosse de ontem.

ALTER DATABASE postgres SET timezone TO 'America/Sao_Paulo';

-- Confira depois de rodar (numa aba nova do SQL Editor, pra pegar
-- uma conexão nova com o timezone já aplicado):
--   SHOW timezone;
--   SELECT CURRENT_DATE, NOW();
