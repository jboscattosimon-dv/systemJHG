-- ================================================================
--  Promoção: preço a prazo promocional por produto
-- ================================================================
-- Na tela da promoção cada produto agora mostra três campos ligados
-- (% de desconto, preço à vista e preço a prazo com a promoção). O
-- preço a prazo digitado fica aqui; sem ele, o a prazo continua
-- recebendo o mesmo percentual de desconto do à vista.
--
-- promocoes_vigentes ganha a coluna nova no retorno — como muda o
-- tipo de retorno, precisa DROP antes do CREATE.

ALTER TABLE public.promocao_itens
  ADD COLUMN IF NOT EXISTS preco_promocional_prazo NUMERIC(10,2) CHECK (preco_promocional_prazo >= 0);

DROP FUNCTION IF EXISTS public.promocoes_vigentes();

CREATE FUNCTION public.promocoes_vigentes()
RETURNS TABLE (
  produto_id              UUID,
  promocao_id             UUID,
  promocao_nome           TEXT,
  data_fim                DATE,
  desconto_percentual     NUMERIC,
  preco_promocional       NUMERIC,
  preco_promocional_prazo NUMERIC
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    pi.produto_id,
    p.id,
    p.nome,
    p.data_fim,
    CASE WHEN pi.preco_promocional IS NULL THEN COALESCE(pi.desconto_percentual, p.desconto_percentual) END,
    pi.preco_promocional,
    pi.preco_promocional_prazo
  FROM public.promocao_itens pi
  JOIN public.promocoes p ON p.id = pi.promocao_id
  WHERE p.ativo
    AND p.empresa_id = public.minha_empresa()
    AND (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p.data_inicio AND p.data_fim;
$$;

GRANT EXECUTE ON FUNCTION public.promocoes_vigentes() TO authenticated;
