-- ================================================================
--  Fase 8i — empresa_id preenchido automaticamente por padrão
-- ================================================================
-- A RLS exige empresa_id = minha_empresa() em toda tabela, mas as
-- telas simples (Clientes, Profissionais, Servicos/Produtos,
-- Agenda, Fornecedores) fazem um INSERT direto na tabela sem
-- informar empresa_id - o frontend nem deveria precisar saber disso,
-- é um detalhe de infraestrutura. Sem essa correção, todo INSERT
-- dessas telas falha com 403 (a policy WITH CHECK rejeita porque
-- empresa_id chega NULL).
--
-- Corrige colocando DEFAULT public.minha_empresa() na coluna - assim
-- qualquer INSERT que não mencionar empresa_id explicitamente já
-- recebe o valor certo automaticamente, sem precisar mudar nenhuma
-- tela. As tabelas que só são escritas via RPC (comandas, caixa,
-- contas, etc.) também ganham o default, por segurança extra, mesmo
-- já recebendo o valor explícito dentro das funções.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','profissionais','servicos','produtos','agendamentos',
    'comandas','itens_comanda','movimentos_caixa','sessoes_caixa',
    'contas_pagar','contas_receber','comissoes','fornecedores',
    'categorias_financeiras','formas_pagamento','movimentacoes_estoque',
    'profissional_servicos','auditoria'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN empresa_id SET DEFAULT public.minha_empresa()', t);
  END LOOP;
END $$;
