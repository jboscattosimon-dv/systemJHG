-- ================================================================
--  Promoções por período
-- ================================================================
-- Uma promoção agrupa alguns produtos com um desconto padrão (%) e
-- vale só entre data_inicio e data_fim (inclusive, no dia de
-- Brasília). Cada produto da promoção pode sobrescrever o desconto
-- padrão com um percentual próprio OU com um preço promocional fixo.
--
-- Não tem job agendado pra "desligar" promoção: a vigência é
-- calculada pela data na hora de consultar (promocoes_vigentes), então
-- no dia seguinte ao data_fim o preço volta sozinho ao normal. O campo
-- "ativo" é só pra pausar/encerrar manualmente antes do prazo.
--
-- O preço com promoção é aplicado na hora de montar a venda/condicional
-- (mesmo modelo do preço a prazo) e fica gravado em
-- itens_comanda.preco_unitario — venda já feita não muda quando a
-- promoção acaba.

CREATE TABLE IF NOT EXISTS public.promocoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT NOT NULL,
  desconto_percentual NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (desconto_percentual BETWEEN 0 AND 100),
  data_inicio         DATE NOT NULL,
  data_fim            DATE NOT NULL,
  ativo               BOOLEAN NOT NULL DEFAULT true,
  empresa_id          UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promocoes_periodo_valido CHECK (data_fim >= data_inicio)
);

CREATE TABLE IF NOT EXISTS public.promocao_itens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promocao_id         UUID NOT NULL REFERENCES public.promocoes(id) ON DELETE CASCADE,
  produto_id          UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  -- NULL nos dois = usa o desconto padrão da promoção.
  desconto_percentual NUMERIC(5,2) CHECK (desconto_percentual BETWEEN 0 AND 100),
  preco_promocional   NUMERIC(10,2) CHECK (preco_promocional >= 0),
  empresa_id          UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promocao_id, produto_id),
  CONSTRAINT promocao_itens_um_tipo_de_desconto CHECK (desconto_percentual IS NULL OR preco_promocional IS NULL)
);

CREATE INDEX IF NOT EXISTS promocoes_empresa_periodo_idx ON public.promocoes (empresa_id, data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS promocao_itens_produto_idx ON public.promocao_itens (produto_id);

-- Leitura pra toda a loja (o PDV precisa do preço promocional);
-- escrita só pra quem pode gerenciar produtos (não-atendente).
ALTER TABLE public.promocoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocao_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promocoes_select" ON public.promocoes;
DROP POLICY IF EXISTS "promocoes_insert" ON public.promocoes;
DROP POLICY IF EXISTS "promocoes_update" ON public.promocoes;
DROP POLICY IF EXISTS "promocoes_delete" ON public.promocoes;

CREATE POLICY "promocoes_select" ON public.promocoes FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());
CREATE POLICY "promocoes_insert" ON public.promocoes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "promocoes_update" ON public.promocoes FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "promocoes_delete" ON public.promocoes FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());

DROP POLICY IF EXISTS "promocao_itens_select" ON public.promocao_itens;
DROP POLICY IF EXISTS "promocao_itens_insert" ON public.promocao_itens;
DROP POLICY IF EXISTS "promocao_itens_update" ON public.promocao_itens;
DROP POLICY IF EXISTS "promocao_itens_delete" ON public.promocao_itens;

CREATE POLICY "promocao_itens_select" ON public.promocao_itens FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());
CREATE POLICY "promocao_itens_insert" ON public.promocao_itens FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "promocao_itens_update" ON public.promocao_itens FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "promocao_itens_delete" ON public.promocao_itens FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());

-- Regras de promoção valendo HOJE (dia de Brasília, explícito pra não
-- depender do timezone da sessão). Um produto pode aparecer em mais de
-- uma promoção vigente — o front escolhe a que der o menor preço.
CREATE OR REPLACE FUNCTION public.promocoes_vigentes()
RETURNS TABLE (
  produto_id          UUID,
  promocao_id         UUID,
  promocao_nome       TEXT,
  data_fim            DATE,
  desconto_percentual NUMERIC,
  preco_promocional   NUMERIC
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    pi.produto_id,
    p.id,
    p.nome,
    p.data_fim,
    CASE WHEN pi.preco_promocional IS NULL THEN COALESCE(pi.desconto_percentual, p.desconto_percentual) END,
    pi.preco_promocional
  FROM public.promocao_itens pi
  JOIN public.promocoes p ON p.id = pi.promocao_id
  WHERE p.ativo
    AND p.empresa_id = public.minha_empresa()
    AND (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p.data_inicio AND p.data_fim;
$$;

GRANT EXECUTE ON FUNCTION public.promocoes_vigentes() TO authenticated;
