-- ================================================================
--  Fix — coluna produtos.comissao_percentual nunca foi criada
-- ================================================================
-- Achado na bateria de testes: finalizar_venda falhava com
-- "column comissao_percentual does not exist" sempre que uma venda
-- tinha produto + profissional vinculado. A migração original
-- (20260905000008) que adiciona essa coluna nunca chegou a rodar
-- neste banco. Sem ela, TODA venda de produto com profissional
-- selecionado no PDV quebra.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS comissao_percentual NUMERIC(5,2);
