-- ================================================================
--  Desconto à vista (Pix, Débito, Crédito, Dinheiro — não parcelado)
-- ================================================================
-- 7º parâmetro novo em finalizar_venda: p_desconto (valor em R$, já
-- calculado pelo front seja % ou fixo). Só reduz o total quando a
-- forma de pagamento NÃO é parcelado — parcelado ignora esse valor.
-- O desconto reduz o que a loja de fato recebe (comanda.total e o
-- lançamento no caixa); não mexe no preço unitário dos itens nem na
-- comissão do profissional (comissão continua sobre o valor cheio do
-- item/serviço).
--
-- DROP explícito da assinatura de 6 parâmetros antes de recriar com 7
-- (CREATE OR REPLACE não troca a função quando a lista de parâmetros
-- muda, cria overload e quebra tudo via PGRST203).

DROP FUNCTION IF EXISTS public.finalizar_venda(TEXT, UUID, TEXT, JSONB, INTEGER, NUMERIC);

CREATE OR REPLACE FUNCTION public.finalizar_venda(
  p_cliente_nome           TEXT,
  p_cliente_id             UUID,
  p_forma_pagamento        TEXT,
  p_itens                  JSONB,
  p_total_parcelas         INTEGER DEFAULT 1,
  p_taxa_cartao_percentual NUMERIC DEFAULT 0,
  p_desconto               NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa             UUID := public.minha_empresa();
  v_comanda_id          UUID;
  v_sessao_id           UUID;
  v_total               NUMERIC(10,2) := 0;
  v_total_final         NUMERIC(10,2);
  v_total_a_receber     NUMERIC(10,2);
  v_item                JSONB;
  v_item_id             UUID;
  v_profissional_id     UUID;
  v_comissao_percentual NUMERIC(5,2);
  v_valor               NUMERIC(10,2);
  v_qtd                 INTEGER;
  v_custo_unitario      NUMERIC(10,2);
  v_tamanho             TEXT;
  v_disponivel          INTEGER;
  v_parcelas            INTEGER;
  v_valor_parcela       NUMERIC(10,2);
  v_valor_parcela_i     NUMERIC(10,2);
  v_soma_parcelas       NUMERIC(10,2);
  v_grupo_parcelamento  UUID;
  i                     INTEGER;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_forma_pagamento = 'parcelado' AND p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um cliente cadastrado para vender parcelado.';
  END IF;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de vender.';
  END IF;

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

  -- Desconto só vale fora do parcelado, e nunca deixa o total negativo.
  v_total_final := CASE
    WHEN p_forma_pagamento = 'parcelado' THEN v_total
    ELSE GREATEST(0, v_total - COALESCE(p_desconto, 0))
  END;

  INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, forma_pagamento, empresa_id)
  VALUES (p_cliente_id, COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), 'fechada', v_total_final, p_forma_pagamento, v_empresa)
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

  IF p_forma_pagamento = 'parcelado' THEN
    v_total_a_receber := CASE
      WHEN p_taxa_cartao_percentual > 0 THEN ROUND(v_total_final / (1 - p_taxa_cartao_percentual / 100), 2)
      ELSE v_total_final
    END;

    v_parcelas := GREATEST(1, COALESCE(p_total_parcelas, 1));
    v_valor_parcela := ROUND(v_total_a_receber / v_parcelas, 2);
    v_soma_parcelas := 0;
    v_grupo_parcelamento := gen_random_uuid();

    FOR i IN 1..v_parcelas LOOP
      IF i < v_parcelas THEN
        v_valor_parcela_i := v_valor_parcela;
        v_soma_parcelas := v_soma_parcelas + v_valor_parcela;
      ELSE
        v_valor_parcela_i := v_total_a_receber - v_soma_parcelas;
      END IF;

      INSERT INTO public.contas_receber (
        cliente_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, origem, comanda_id, empresa_id
      ) VALUES (
        p_cliente_id,
        'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Cliente')
          || CASE WHEN p_taxa_cartao_percentual > 0 THEN ' (cartão)' ELSE ' (crediário)' END
          || CASE WHEN v_parcelas > 1 THEN format(' (%s/%s)', i, v_parcelas) ELSE '' END,
        v_valor_parcela_i, (CURRENT_DATE + (i * INTERVAL '30 days'))::DATE,
        i, v_parcelas, v_grupo_parcelamento, 'venda', v_comanda_id, v_empresa
      );
    END LOOP;
  ELSE
    INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, comanda_id, sessao_caixa_id, empresa_id)
    VALUES ('entrada', 'venda', 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), v_total_final, v_comanda_id, v_sessao_id, v_empresa);
  END IF;

  RETURN v_comanda_id;
END;
$$;
