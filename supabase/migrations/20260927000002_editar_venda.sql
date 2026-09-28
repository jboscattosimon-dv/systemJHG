-- ================================================================
--  Editar venda já fechada (itens e quantidades)
-- ================================================================
-- Escopo deliberadamente restrito, pra não arriscar inconsistência:
--   - só vendas à vista (não parcelado — mexeria em parcelas de
--     contas_receber, algumas já podendo estar baixadas);
--   - só se nenhuma comissão gerada por essa venda já foi aprovada
--     ou paga (senão a correção mexeria em algo que já saiu daqui);
--   - só quem pode gerenciar financeiro (mesma trava de
--     baixar_conta_pagar/receber).
--
-- Mecânica: estorna o estoque de cada item antigo (com registro em
-- movimentacoes_estoque, pra manter rastro), apaga itens e comissões
-- antigas, insere os itens novos rodando a MESMA lógica de baixa de
-- estoque e cálculo de comissão que finalizar_venda usa, e por fim
-- ATUALIZA o movimento_caixa que já existia (nunca cria um segundo
-- lançamento pra mesma venda).

CREATE OR REPLACE FUNCTION public.editar_venda(
  p_comanda_id      UUID,
  p_cliente_nome    TEXT,
  p_cliente_id      UUID,
  p_forma_pagamento TEXT,
  p_itens           JSONB,
  p_desconto        NUMERIC DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_empresa             UUID := public.minha_empresa();
  v_comanda             RECORD;
  v_old_item            RECORD;
  v_item                JSONB;
  v_item_id             UUID;
  v_qtd                 INTEGER;
  v_valor               NUMERIC(10,2);
  v_tamanho             TEXT;
  v_profissional_id     UUID;
  v_custo_unitario      NUMERIC(10,2);
  v_comissao_percentual NUMERIC(5,2);
  v_comissao_usuario    NUMERIC(5,2);
  v_disponivel          INTEGER;
  v_total               NUMERIC(10,2) := 0;
  v_total_final         NUMERIC(10,2);
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para editar vendas.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  SELECT * INTO v_comanda FROM public.comandas WHERE id = p_comanda_id AND empresa_id = v_empresa FOR UPDATE;
  IF v_comanda IS NULL THEN
    RAISE EXCEPTION 'Venda não encontrada.';
  END IF;
  IF v_comanda.status <> 'fechada' THEN
    RAISE EXCEPTION 'Só é possível editar vendas fechadas.';
  END IF;
  IF v_comanda.forma_pagamento = 'parcelado' OR p_forma_pagamento = 'parcelado' THEN
    RAISE EXCEPTION 'Vendas parceladas não podem ser editadas por aqui — cancele os itens e refaça a venda.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.comissoes WHERE comanda_id = p_comanda_id AND status IN ('aprovada', 'paga')) THEN
    RAISE EXCEPTION 'Essa venda já tem comissão aprovada ou paga — não pode mais ser editada.';
  END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A venda precisa ter ao menos um item.';
  END IF;

  -- Estorna o estoque de cada item antigo, com rastro em movimentacoes_estoque.
  FOR v_old_item IN SELECT * FROM public.itens_comanda WHERE comanda_id = p_comanda_id
  LOOP
    IF v_old_item.tipo = 'produto' THEN
      IF v_old_item.tamanho IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.produto_tamanhos WHERE produto_id = v_old_item.referencia_id AND tamanho = v_old_item.tamanho
      ) THEN
        UPDATE public.produto_tamanhos SET quantidade = quantidade + v_old_item.quantidade
        WHERE produto_id = v_old_item.referencia_id AND tamanho = v_old_item.tamanho;
      ELSE
        UPDATE public.produtos SET estoque_atual = estoque_atual + v_old_item.quantidade
        WHERE id = v_old_item.referencia_id;
      END IF;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES (v_old_item.referencia_id, 'entrada', v_old_item.quantidade, 'Estorno por edição de venda', 'comanda', p_comanda_id, v_empresa);
    END IF;
  END LOOP;

  -- Já garantimos acima que nenhuma comissão dessa venda está aprovada/paga.
  DELETE FROM public.comissoes WHERE comanda_id = p_comanda_id;
  DELETE FROM public.itens_comanda WHERE comanda_id = p_comanda_id;

  SELECT COALESCE(SUM((i->>'preco_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total
  FROM jsonb_array_elements(p_itens) i;

  v_total_final := GREATEST(0, v_total - COALESCE(p_desconto, 0));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd             := (v_item->>'quantidade')::INTEGER;
    v_valor           := (v_item->>'preco_unitario')::NUMERIC;
    v_profissional_id := NULLIF(v_item->>'profissional_id', '')::UUID;
    v_tamanho         := NULLIF(v_item->>'tamanho', '');
    v_comissao_percentual := NULL;
    v_custo_unitario  := NULL;

    IF v_item->>'tipo' = 'produto' THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;

      SELECT preco_custo INTO v_custo_unitario FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;

      IF v_tamanho IS NOT NULL THEN
        SELECT quantidade INTO v_disponivel FROM public.produto_tamanhos
        WHERE produto_id = (v_item->>'referencia_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa;
        IF v_disponivel IS NOT NULL AND v_disponivel < v_qtd THEN
          RAISE EXCEPTION 'Estoque insuficiente de "%" tamanho % — disponível: %.', v_item->>'nome', v_tamanho, v_disponivel;
        END IF;
      END IF;
    ELSIF v_item->>'tipo' = 'servico' THEN
      IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Serviço "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario, tamanho, empresa_id)
    VALUES (p_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd, v_valor, v_profissional_id, v_custo_unitario, v_tamanho, v_empresa)
    RETURNING id INTO v_item_id;

    IF v_item->>'tipo' = 'produto' THEN
      IF v_tamanho IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.produto_tamanhos WHERE produto_id = (v_item->>'referencia_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa
      ) THEN
        UPDATE public.produto_tamanhos SET quantidade = quantidade - v_qtd
        WHERE produto_id = (v_item->>'referencia_id')::UUID AND tamanho = v_tamanho AND empresa_id = v_empresa;
      ELSE
        UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
        WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      END IF;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES ((v_item->>'referencia_id')::UUID, 'venda', -v_qtd, 'Venda PDV (edição)' || CASE WHEN v_tamanho IS NOT NULL THEN ' — tamanho ' || v_tamanho ELSE '' END, 'comanda', p_comanda_id, v_empresa);
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
          v_profissional_id, p_comanda_id, v_item_id,
          v_valor * v_qtd, v_comissao_percentual,
          ROUND(v_valor * v_qtd * v_comissao_percentual / 100, 2),
          'pendente', v_empresa
        );
      END IF;
    END IF;
  END LOOP;

  UPDATE public.comandas
  SET cliente_id = p_cliente_id,
      cliente_nome = COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'),
      forma_pagamento = p_forma_pagamento,
      total = v_total_final
  WHERE id = p_comanda_id;

  -- Atualiza o lançamento financeiro que já existia — nunca cria um novo.
  UPDATE public.movimentos_caixa
  SET valor = v_total_final,
      descricao = 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão') || ' (editada)'
  WHERE comanda_id = p_comanda_id;

  -- Recalcula a comissão do usuário que originalmente fez a venda
  -- (não de quem está editando agora) sobre o total corrigido.
  IF v_comanda.usuario_id IS NOT NULL THEN
    SELECT comissao_percentual INTO v_comissao_usuario FROM public.usuario_perfis WHERE usuario_id = v_comanda.usuario_id;
    IF v_comissao_usuario IS NOT NULL AND v_comissao_usuario > 0 THEN
      INSERT INTO public.comissoes (usuario_id, comanda_id, valor_base, percentual, valor_comissao, status, empresa_id)
      VALUES (v_comanda.usuario_id, p_comanda_id, v_total_final, v_comissao_usuario, ROUND(v_total_final * v_comissao_usuario / 100, 2), 'pendente', v_empresa);
    END IF;
  END IF;
END;
$$;
