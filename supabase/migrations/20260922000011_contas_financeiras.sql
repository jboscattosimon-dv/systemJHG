-- ================================================================
--  Contas financeiras (múltiplas contas — Caixa, Banco...)
-- ================================================================
-- Até aqui existia um único "caixa" implícito por loja (movimentos_caixa
-- + sessoes_caixa, particionado só por turno de operador). Isso passa a
-- ser "Caixa" — a primeira conta financeira, criada automaticamente —
-- e a loja pode cadastrar quantas outras quiser (ex: "Banco Itaú").
--
-- A conta financeira só aparece a partir do MOVIMENTO (o passo da
-- baixa), nunca no título (contas_pagar/contas_receber não sabem qual
-- conta vai liquidar — isso só se decide na hora de pagar/receber de
-- verdade). Por isso a coluna nova é em movimentos_caixa, não nos
-- títulos.
--
-- Fora do escopo por decisão do usuário: transferência entre contas,
-- conciliação bancária, centro de custo.

CREATE TABLE IF NOT EXISTS public.contas_financeiras (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'banco' CHECK (tipo IN ('caixa', 'banco')),
  padrao     BOOLEAN NOT NULL DEFAULT false,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  empresa_id UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, nome)
);

ALTER TABLE public.contas_financeiras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leitura_empresa" ON public.contas_financeiras;
CREATE POLICY "leitura_empresa" ON public.contas_financeiras FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());

DROP POLICY IF EXISTS "insert_financeiro" ON public.contas_financeiras;
CREATE POLICY "insert_financeiro" ON public.contas_financeiras FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "update_financeiro" ON public.contas_financeiras;
CREATE POLICY "update_financeiro" ON public.contas_financeiras FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "delete_financeiro" ON public.contas_financeiras;
CREATE POLICY "delete_financeiro" ON public.contas_financeiras FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_financeiro());

-- Toda loja já existente ganha uma conta "Caixa" (marcada como padrão,
-- pra tudo que já existe hoje continuar funcionando sem escolher conta).
INSERT INTO public.contas_financeiras (nome, tipo, padrao, empresa_id)
SELECT 'Caixa', 'caixa', true, e.id
FROM public.empresas e
WHERE NOT EXISTS (SELECT 1 FROM public.contas_financeiras cf WHERE cf.empresa_id = e.id);

-- Loja nova também nasce com a conta "Caixa" padrão.
CREATE OR REPLACE FUNCTION public.seed_nova_empresa()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.configuracoes (empresa_id, nome_empresa)
  VALUES (NEW.id, NEW.nome);

  INSERT INTO public.categorias_financeiras (empresa_id, nome, tipo) VALUES
    (NEW.id, 'Serviços',              'receita'),
    (NEW.id, 'Produtos',              'receita'),
    (NEW.id, 'Outras receitas',       'receita'),
    (NEW.id, 'Aluguel',               'despesa'),
    (NEW.id, 'Energia',               'despesa'),
    (NEW.id, 'Água',                  'despesa'),
    (NEW.id, 'Internet',              'despesa'),
    (NEW.id, 'Salários',              'despesa'),
    (NEW.id, 'Comissões',             'despesa'),
    (NEW.id, 'Pró-labore',            'despesa'),
    (NEW.id, 'Produtos para revenda', 'despesa'),
    (NEW.id, 'Materiais',             'despesa'),
    (NEW.id, 'Marketing',             'despesa'),
    (NEW.id, 'Sistemas',              'despesa'),
    (NEW.id, 'Impostos',              'despesa'),
    (NEW.id, 'Manutenção',            'despesa'),
    (NEW.id, 'Outras despesas',       'despesa');

  INSERT INTO public.formas_pagamento (empresa_id, nome) VALUES
    (NEW.id, 'Dinheiro'), (NEW.id, 'PIX'), (NEW.id, 'Débito'), (NEW.id, 'Crédito'), (NEW.id, 'Transferência'), (NEW.id, 'Outros');

  INSERT INTO public.contas_financeiras (empresa_id, nome, tipo, padrao) VALUES
    (NEW.id, 'Caixa', 'caixa', true);

  RETURN NEW;
END;
$$;

-- movimentos_caixa passa a apontar pra qual conta financeira foi
-- afetada. Existentes (e novos, quando ninguém escolher explicitamente)
-- caem na conta padrão da loja — histórico não se perde nem fica
-- órfão.
ALTER TABLE public.movimentos_caixa ADD COLUMN IF NOT EXISTS conta_financeira_id UUID REFERENCES public.contas_financeiras(id) ON DELETE SET NULL;

UPDATE public.movimentos_caixa mc
SET conta_financeira_id = (
  SELECT cf.id FROM public.contas_financeiras cf WHERE cf.empresa_id = mc.empresa_id AND cf.padrao = true LIMIT 1
)
WHERE conta_financeira_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_movimentos_caixa_conta ON public.movimentos_caixa (conta_financeira_id);

-- Atalho usado por várias RPCs pra resolver "se não escolheram conta,
-- usa a padrão da loja".
CREATE OR REPLACE FUNCTION public.conta_financeira_padrao()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.contas_financeiras WHERE empresa_id = public.minha_empresa() AND padrao = true LIMIT 1;
$$;

-- Saldo de cada conta = soma de todo o histórico de movimentos_caixa
-- daquela conta (entrada soma, saída subtrai) — inclui o capital
-- inicial, que é só mais um movimento de entrada.
CREATE OR REPLACE FUNCTION public.saldo_contas_financeiras()
RETURNS TABLE (conta_id UUID, nome TEXT, tipo TEXT, padrao BOOLEAN, saldo NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    cf.id, cf.nome, cf.tipo, cf.padrao,
    COALESCE(SUM(CASE WHEN mc.tipo = 'entrada' THEN mc.valor WHEN mc.tipo = 'saida' THEN -mc.valor ELSE 0 END), 0) AS saldo
  FROM public.contas_financeiras cf
  LEFT JOIN public.movimentos_caixa mc ON mc.conta_financeira_id = cf.id
  WHERE cf.empresa_id = public.minha_empresa() AND cf.ativo = true
  GROUP BY cf.id, cf.nome, cf.tipo, cf.padrao
  ORDER BY cf.padrao DESC, cf.nome;
$$;
