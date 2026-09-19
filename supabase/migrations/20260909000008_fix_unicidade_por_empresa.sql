-- ================================================================
--  Fase 8h — Corrige unicidade global que sobrou do single-tenant
-- ================================================================
-- categorias_financeiras tinha UNIQUE (nome, tipo) e formas_pagamento
-- tinha UNIQUE (nome) - restrições da época em que só existia uma
-- loja. Agora que cada empresa tem seu próprio seed (Serviços,
-- Dinheiro, etc.), a segunda loja em diante não conseguia ser criada:
-- o INSERT trigger colidia com os nomes que a primeira loja já
-- "tinha". A unicidade tem que ser por loja, não global.

ALTER TABLE public.categorias_financeiras DROP CONSTRAINT IF EXISTS categorias_financeiras_nome_tipo_key;
ALTER TABLE public.categorias_financeiras ADD CONSTRAINT categorias_financeiras_empresa_nome_tipo_key UNIQUE (empresa_id, nome, tipo);

ALTER TABLE public.formas_pagamento DROP CONSTRAINT IF EXISTS formas_pagamento_nome_key;
ALTER TABLE public.formas_pagamento ADD CONSTRAINT formas_pagamento_empresa_nome_key UNIQUE (empresa_id, nome);
