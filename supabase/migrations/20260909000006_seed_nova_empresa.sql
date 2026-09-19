-- ================================================================
--  Fase 8f — Seed automático ao criar uma loja nova
-- ================================================================
-- Toda empresa nova nasce com: configurações padrão, categorias
-- financeiras padrão e formas de pagamento padrão - sem isso, a
-- loja abriria com Financeiro/PDV vazios de cadastros básicos.

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_nova_empresa ON public.empresas;
CREATE TRIGGER trg_seed_nova_empresa AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.seed_nova_empresa();
