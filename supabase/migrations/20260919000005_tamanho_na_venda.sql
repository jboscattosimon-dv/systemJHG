-- ================================================================
--  Tamanho na venda e no condicional + estoque por tamanho de verdade
-- ================================================================
-- Até aqui produto_tamanhos só existia pra CADASTRO — nada na venda
-- ou no condicional sabia de tamanho, e o estoque total só descia
-- direto em produtos.estoque_atual (o que fica errado assim que
-- alguém mexe de novo em produto_tamanhos, porque o trigger
-- recalcula o total a partir da soma dos tamanhos e desfaz a baixa
-- direta). Esta migração:
--   1. adiciona a coluna tamanho em itens_comanda e itens_condicional
--   2. faz finalizar_venda debitar o tamanho certo em
--      produto_tamanhos (o trigger já existente recalcula o total)
--      quando o item informa tamanho e ele existe pro produto —
--      senão continua debitando estoque_atual direto, como sempre
--   3. bloqueia a venda por falta de estoque SÓ quando o item tem
--      tamanho controlado (produto sem tamanho continua permissivo,
--      como já era)
--   4. propaga o tamanho de criar_condicional até fechar_condicional
--      (que já reaproveita finalizar_venda pros itens vendidos)
--
-- Renomeia também a tela PDV -> Vendas nas permissões já salvas,
-- pra quem já tinha customizado permissão de tela não perder acesso.

ALTER TABLE public.itens_comanda ADD COLUMN IF NOT EXISTS tamanho TEXT;
ALTER TABLE public.itens_condicional ADD COLUMN IF NOT EXISTS tamanho TEXT;

UPDATE public.usuario_perfis
SET telas_permitidas = array_replace(telas_permitidas, 'pdv', 'vendas')
WHERE telas_permitidas IS NOT NULL AND 'pdv' = ANY(telas_permitidas);

-- ── finalizar_venda ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalizar_venda(
  p_cliente_nome    TEXT,
  p_cliente_id      UUID,
  p_forma_pagamento TEXT,
  p_itens           JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa             UUID := public.minha_empresa();
  v_comanda_id          UUID;
  v_sessao_id           UUID;
  v_total               NUMERIC(10,2) := 0;
  v_item                JSONB;
  v_item_id             UUID;
  v_profissional_id     UUID;
  v_comissao_percentual NUMERIC(5,2);
  v_valor               NUMERIC(10,2);
  v_qtd                 INTEGER;
  v_custo_unitario      NUMERIC(10,2);
  v_tamanho             TEXT;
  v_disponivel          INTEGER;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de vender.';
  END IF;

  -- Valida catálogo + (quando tem tamanho controlado) estoque suficiente,
  -- antes de registrar qualquer coisa.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    IF v_item->>'tipo' = 'produto' THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;

      v_tamanho := NULLIF(v_item->>'tamanho', '');
      IF v_tamanho IS NOT NULL THEN
        SELECT quantidade INTO v_disponivel FROM public.produto_tamanhos
        WHERE produto_id = (v_item->>'referencia_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa;
        IF v_disponivel IS NOT NULL AND v_disponivel < (v_item->>'quantidade')::INTEGER THEN
          RAISE EXCEPTION 'Estoque insuficiente de "%" tamanho % — disponível: %.', v_item->>'nome', v_tamanho, v_disponivel;
        END IF;
      END IF;
    ELSIF v_item->>'tipo' = 'servico' THEN
      IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Serviço "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM((i->>'preco_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total
  FROM jsonb_array_elements(p_itens) i;

  INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, forma_pagamento, empresa_id)
  VALUES (p_cliente_id, COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), 'fechada', v_total, p_forma_pagamento, v_empresa)
  RETURNING id INTO v_comanda_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd             := (v_item->>'quantidade')::INTEGER;
    v_valor           := (v_item->>'preco_unitario')::NUMERIC;
    v_profissional_id := NULLIF(v_item->>'profissional_id', '')::UUID;
    v_tamanho         := NULLIF(v_item->>'tamanho', '');
    v_comissao_percentual := NULL;
    v_custo_unitario  := NULL;

    IF v_item->>'tipo' = 'produto' THEN
      SELECT preco_custo INTO v_custo_unitario FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario, tamanho, empresa_id)
    VALUES (v_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd, v_valor, v_profissional_id, v_custo_unitario, v_tamanho, v_empresa)
    RETURNING id INTO v_item_id;

    IF v_item->>'tipo' = 'produto' THEN
      IF v_tamanho IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.produto_tamanhos
        WHERE produto_id = (v_item->>'referencia_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa
      ) THEN
        UPDATE public.produto_tamanhos SET quantidade = quantidade - v_qtd
        WHERE produto_id = (v_item->>'referencia_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa;
      ELSE
        UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
        WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      END IF;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES ((v_item->>'referencia_id')::UUID, 'venda', -v_qtd, 'Venda PDV' || CASE WHEN v_tamanho IS NOT NULL THEN ' — tamanho ' || v_tamanho ELSE '' END, 'comanda', v_comanda_id, v_empresa);
    END IF;

    IF v_profissional_id IS NOT NULL THEN
      IF v_item->>'tipo' = 'servico' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      ELSIF v_item->>'tipo' = 'produto' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NULL THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.profissionais WHERE id = v_profissional_id AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NOT NULL AND v_comissao_percentual > 0 THEN
        INSERT INTO public.comissoes (profissional_id, comanda_id, item_comanda_id, valor_base, percentual, valor_comissao, status, empresa_id)
        VALUES (
          v_profissional_id, v_comanda_id, v_item_id,
          v_valor * v_qtd, v_comissao_percentual,
          ROUND(v_valor * v_qtd * v_comissao_percentual / 100, 2),
          'pendente', v_empresa
        );
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, comanda_id, sessao_caixa_id, empresa_id)
  VALUES ('entrada', 'venda', 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), v_total, v_comanda_id, v_sessao_id, v_empresa);

  RETURN v_comanda_id;
END;
$$;

-- ── criar_condicional: aceita e valida tamanho ──────────────────
CREATE OR REPLACE FUNCTION public.criar_condicional(
  p_cliente_id UUID,
  p_itens      JSONB,
  p_observacao TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa        UUID := public.minha_empresa();
  v_condicional_id UUID;
  v_item           JSONB;
  v_tamanho        TEXT;
  v_disponivel     INTEGER;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Cliente não encontrado no cadastro da sua loja.';
  END IF;

  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um produto ao condicional.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = (v_item->>'produto_id')::UUID AND empresa_id = v_empresa) THEN
      RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
    END IF;

    v_tamanho := NULLIF(v_item->>'tamanho', '');
    IF v_tamanho IS NOT NULL THEN
      SELECT quantidade INTO v_disponivel FROM public.produto_tamanhos
      WHERE produto_id = (v_item->>'produto_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa;
      IF v_disponivel IS NULL THEN
        RAISE EXCEPTION 'Tamanho % não cadastrado para "%".', v_tamanho, v_item->>'nome';
      ELSIF v_disponivel < (v_item->>'quantidade')::INTEGER THEN
        RAISE EXCEPTION 'Estoque insuficiente de "%" tamanho % — disponível: %.', v_item->>'nome', v_tamanho, v_disponivel;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.condicionais (cliente_id, usuario_id, observacao, empresa_id)
  VALUES (p_cliente_id, auth.uid(), NULLIF(p_observacao, ''), v_empresa)
  RETURNING id INTO v_condicional_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO public.itens_condicional (condicional_id, produto_id, nome, tamanho, quantidade, preco_unitario, empresa_id)
    VALUES (
      v_condicional_id,
      (v_item->>'produto_id')::UUID,
      v_item->>'nome',
      NULLIF(v_item->>'tamanho', ''),
      (v_item->>'quantidade')::INTEGER,
      (v_item->>'preco_unitario')::NUMERIC,
      v_empresa
    );
  END LOOP;

  RETURN v_condicional_id;
END;
$$;

-- ── fechar_condicional: propaga o tamanho pra finalizar_venda ──
CREATE OR REPLACE FUNCTION public.fechar_condicional(
  p_condicional_id  UUID,
  p_decisoes        JSONB,
  p_forma_pagamento TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa      UUID := public.minha_empresa();
  v_cliente_id   UUID;
  v_cliente_nome TEXT;
  v_decisao      JSONB;
  v_item_id      UUID;
  v_status       TEXT;
  v_itens_venda  JSONB := '[]'::JSONB;
  v_venda_id     UUID := NULL;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  SELECT cliente_id INTO v_cliente_id
  FROM public.condicionais
  WHERE id = p_condicional_id AND empresa_id = v_empresa AND status = 'aberto';

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Condicional não encontrado, de outra loja, ou já fechado.';
  END IF;

  SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = v_cliente_id;

  FOR v_decisao IN SELECT * FROM jsonb_array_elements(p_decisoes)
  LOOP
    v_item_id := (v_decisao->>'item_id')::UUID;
    v_status  := v_decisao->>'status';

    IF v_status NOT IN ('vendido', 'devolvido') THEN
      RAISE EXCEPTION 'Status de item inválido: %', v_status;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.itens_condicional WHERE id = v_item_id AND condicional_id = p_condicional_id) THEN
      RAISE EXCEPTION 'Item não pertence a esse condicional.';
    END IF;

    UPDATE public.itens_condicional SET status = v_status WHERE id = v_item_id;

    IF v_status = 'vendido' THEN
      SELECT v_itens_venda || jsonb_build_object(
        'tipo', 'produto',
        'referencia_id', ic.produto_id,
        'nome', ic.nome,
        'tamanho', ic.tamanho,
        'quantidade', ic.quantidade,
        'preco_unitario', CASE WHEN p_forma_pagamento = 'credito' THEN COALESCE(p.preco_venda_prazo, ic.preco_unitario) ELSE ic.preco_unitario END,
        'profissional_id', NULL
      ) INTO v_itens_venda
      FROM public.itens_condicional ic
      JOIN public.produtos p ON p.id = ic.produto_id
      WHERE ic.id = v_item_id;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.itens_condicional WHERE condicional_id = p_condicional_id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Todos os itens precisam de uma decisão (vendido ou devolvido) antes de fechar.';
  END IF;

  IF jsonb_array_length(v_itens_venda) > 0 THEN
    IF p_forma_pagamento IS NULL THEN
      RAISE EXCEPTION 'Informe a forma de pagamento para os itens vendidos.';
    END IF;
    v_venda_id := public.finalizar_venda(v_cliente_nome, v_cliente_id, p_forma_pagamento, v_itens_venda);
  END IF;

  UPDATE public.condicionais
  SET status = 'fechado', fechado_em = NOW(), venda_id = v_venda_id
  WHERE id = p_condicional_id;

  RETURN v_venda_id;
END;
$$;
