-- ================================================================
--  Condicional — pré-venda de produtos (cliente leva pra casa)
-- ================================================================
-- Cliente leva produtos pra decidir em casa. O estoque NÃO é
-- debitado na retirada (continua contando como estoque disponível
-- até o condicional ser fechado). Ao fechar, cada item vira uma de
-- duas coisas:
--   - vendido:   entra numa venda de verdade via finalizar_venda()
--                (debita estoque, gera comissão, lança no caixa —
--                exatamente como uma venda normal do PDV)
--   - devolvido: só marca o item, sem nenhum efeito em estoque
--                (porque nunca chegou a sair)

CREATE TABLE IF NOT EXISTS public.condicionais (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  usuario_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  observacao  TEXT,
  venda_id    UUID REFERENCES public.comandas(id) ON DELETE SET NULL,
  empresa_id  UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fechado_em  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.itens_condicional (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condicional_id UUID NOT NULL REFERENCES public.condicionais(id) ON DELETE CASCADE,
  produto_id     UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  nome           TEXT NOT NULL,
  quantidade     INTEGER NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(10,2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'vendido', 'devolvido')),
  empresa_id     UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_itens_condicional_condicional ON public.itens_condicional (condicional_id);

ALTER TABLE public.condicionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_condicional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empresa_isolada" ON public.condicionais;
CREATE POLICY "empresa_isolada" ON public.condicionais FOR ALL TO authenticated
  USING (empresa_id = public.minha_empresa()) WITH CHECK (empresa_id = public.minha_empresa());

DROP POLICY IF EXISTS "empresa_isolada" ON public.itens_condicional;
CREATE POLICY "empresa_isolada" ON public.itens_condicional FOR ALL TO authenticated
  USING (empresa_id = public.minha_empresa()) WITH CHECK (empresa_id = public.minha_empresa());

-- ── criar_condicional ───────────────────────────────────────────
-- p_itens: [{ "produto_id": "...", "nome": "...", "quantidade": 2, "preco_unitario": 59.90 }, ...]
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
  END LOOP;

  INSERT INTO public.condicionais (cliente_id, usuario_id, observacao, empresa_id)
  VALUES (p_cliente_id, auth.uid(), NULLIF(p_observacao, ''), v_empresa)
  RETURNING id INTO v_condicional_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO public.itens_condicional (condicional_id, produto_id, nome, quantidade, preco_unitario, empresa_id)
    VALUES (
      v_condicional_id,
      (v_item->>'produto_id')::UUID,
      v_item->>'nome',
      (v_item->>'quantidade')::INTEGER,
      (v_item->>'preco_unitario')::NUMERIC,
      v_empresa
    );
  END LOOP;

  RETURN v_condicional_id;
END;
$$;

-- ── fechar_condicional ──────────────────────────────────────────
-- p_decisoes: [{ "item_id": "...", "status": "vendido" | "devolvido" }, ...]
-- Precisa cobrir TODOS os itens do condicional (nenhum pode ficar
-- 'pendente'). Itens 'vendido' viram uma venda de verdade via
-- finalizar_venda (que já exige caixa aberto).
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
        'referencia_id', produto_id,
        'nome', nome,
        'quantidade', quantidade,
        'preco_unitario', preco_unitario,
        'profissional_id', NULL
      ) INTO v_itens_venda
      FROM public.itens_condicional WHERE id = v_item_id;
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
