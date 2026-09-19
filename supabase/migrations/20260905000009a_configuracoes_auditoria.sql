-- ================================================================
--  Fase 7a — Configurações + Auditoria (tabelas e trigger)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.configuracoes (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome_empresa          TEXT NOT NULL DEFAULT 'BarberOS',
  cnpj                  TEXT,
  telefone              TEXT,
  endereco              TEXT,
  logo_url              TEXT,
  horario_abertura      TIME NOT NULL DEFAULT '08:00',
  horario_fechamento    TIME NOT NULL DEFAULT '20:00',
  duracao_padrao_min    INTEGER NOT NULL DEFAULT 30,
  tolerancia_atraso_min INTEGER NOT NULL DEFAULT 10,
  regras_cancelamento   TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.configuracoes (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.auditoria (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acao         TEXT NOT NULL CHECK (acao IN ('insert', 'update', 'delete')),
  modulo       TEXT NOT NULL,
  registro_id  UUID,
  dados_antes  JSONB,
  dados_depois JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON public.auditoria (modulo, created_at DESC);
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.registrar_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.auditoria (usuario_id, acao, modulo, registro_id, dados_antes, dados_depois)
  VALUES (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE((NEW).id, (OLD).id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria ON public.comandas;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.comandas
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria ON public.sessoes_caixa;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.sessoes_caixa
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria ON public.contas_pagar;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria ON public.contas_receber;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria ON public.agendamentos;
CREATE TRIGGER trg_auditoria AFTER UPDATE OR DELETE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();
