-- =============================================================================
-- VetMax — Migration 0113: Títulos Financeiros (Contas a Receber / Pagar)
-- G-09 Módulo Financeiro Core
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.financial_entries (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id       UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL CHECK (type IN ('receivable', 'payable')),
  description     TEXT        NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date        DATE        NOT NULL,
  payment_date    DATE,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_method  TEXT,
  tutor_id        UUID        REFERENCES public.tutors(id)    ON DELETE SET NULL,
  patient_id      UUID        REFERENCES public.patients(id)  ON DELETE SET NULL,
  category        TEXT,
  notes           TEXT,
  created_by      UUID        REFERENCES auth.users(id)       ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_entries_clinic_type
  ON public.financial_entries (clinic_id, type);

CREATE INDEX IF NOT EXISTS idx_financial_entries_clinic_status
  ON public.financial_entries (clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_financial_entries_due_date
  ON public.financial_entries (clinic_id, due_date);

CREATE INDEX IF NOT EXISTS idx_financial_entries_tutor
  ON public.financial_entries (tutor_id);

CREATE OR REPLACE FUNCTION public.set_financial_entries_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_financial_entries_updated_at ON public.financial_entries;
CREATE TRIGGER trg_financial_entries_updated_at
  BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_financial_entries_updated_at();

COMMENT ON TABLE public.financial_entries IS 'Títulos a receber (receivable) e a pagar (payable) por clínica.';
