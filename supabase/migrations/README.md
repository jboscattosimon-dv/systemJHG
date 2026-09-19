# Migrations

Este projeto não usa `supabase db push` — as migrations abaixo são aplicadas
manualmente pelo **SQL Editor** do painel do Supabase (Database → SQL Editor),
uma de cada vez, **na ordem dos nomes dos arquivos**.

Todas as migrations são idempotentes (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`),
então rodar uma de novo por engano não duplica dados nem quebra nada.

## Ordem de aplicação

1. `20260904000001_cleanup_legacy_schema.sql` — remove o schema antigo abandonado
2. `20260904000002_categorias_financeiras.sql` — cadastro de categorias
3. `20260904000003_formas_pagamento.sql` — cadastro de formas de pagamento
4. `20260904000004_fornecedores.sql` — cadastro de fornecedores
5. `20260904000005_usuario_perfis.sql` — papéis de acesso (admin/gerente/atendente/profissional)
6. `20260905000001_cadastros_fase2.sql`
7. `20260905000002_agenda_conflitos.sql`
8. `20260905000003_venda_estoque_comissao.sql`
9. `20260905000004_caixa.sql`
10. `20260905000005_contas_pagar_receber.sql`
11. `20260905000006_dre_e_comissoes.sql`
12. `20260905000007_fix_trigger_novo_usuario.sql`
13. `20260905000008_comissao_produto_e_lancamento_caixa.sql`
14. `20260905000009a_configuracoes_auditoria.sql`
15. `20260905000009b_rls_financeiro.sql`
16. `20260905000009c_gestao_usuarios.sql`
17. `20260905000009d_rpcs_financeiro_guardadas.sql`

Depois de rodar a `20260904000005`, todo usuário que já existir no seu projeto
Supabase vira `administrador` automaticamente — ninguém perde acesso.

A Fase 7 (itens 14-17) foi dividida em 4 arquivos menores em vez de um só,
porque a versão original deu timeout de conexão no SQL Editor. Cada um desses
4 é seguro de rodar de novo caso dê timeout no meio.

## Fase 8 — Multi-tenant (⚠️ apaga os dados operacionais atuais)

18. `20260909000001_multitenant_schema.sql` — cria `empresas`, **zera clientes/
    produtos/agendamentos/vendas/financeiro/etc.** (combinado com a usuária),
    adiciona `empresa_id` em toda tabela operacional, recria `configuracoes`
    por loja, e promove `adm@dev.com` a `super_admin`
19. `20260909000002_multitenant_rls.sql` — RLS: cada loja só enxerga os
    próprios dados; super_admin só gerencia empresas/usuários, não vê dado
    operacional de nenhuma loja
20. `20260909000003_multitenant_rpcs_caixa.sql` — abrir/fechar caixa, lançar
    movimento e finalizar venda, todos escopados por loja
21. `20260909000004_multitenant_rpcs_financeiro.sql` — contas a pagar/receber
    e DRE escopados por loja
22. `20260909000005_multitenant_rpcs_usuarios.sql` — listar usuários e
    atualizar papel/loja de um usuário (só super_admin vincula/troca loja)
23. `20260909000006_seed_nova_empresa.sql` — toda loja nova nasce com
    configurações, categorias financeiras e formas de pagamento padrão

Depois de rodar tudo isso: `adm@dev.com` vira super administradora da
plataforma (sem loja própria) e usa a tela **Empresas** pra cadastrar as
lojas clientes, e **Usuários** pra vincular o primeiro login de cada uma.
