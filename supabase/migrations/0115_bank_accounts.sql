-- =============================================================================
-- VetMax — Migration 0115: Contas Bancárias por Clínica
-- G-09 Módulo Financeiro Core (base para Extrato G-11)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id   UUID          NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name        TEXT          NOT NULL,
  bank_name   TEXT,
  bank_code   TEXT,
  agency      TEXT,
  account     TEXT,
  pix_key     TEXT,
  is_default  BOOLEAN       NOT NULL DEFAULT false,
  balance     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, name)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_clinic
  ON public.bank_accounts (clinic_id);

CREATE OR REPLACE FUNCTION public.enforce_single_default_bank_account()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.bank_accounts
      SET is_default = false
      WHERE clinic_id = NEW.clinic_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_default_bank_account ON public.bank_accounts;
CREATE TRIGGER trg_single_default_bank_account
  AFTER INSERT OR UPDATE OF is_default ON public.bank_accounts
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.enforce_single_default_bank_account();

INSERT INTO public.bank_accounts (clinic_id, name, is_default)
SELECT id, 'Caixa Central', true
FROM   public.clinics
ON CONFLICT (clinic_id, name) DO NOTHING;

COMMENT ON TABLE public.bank_accounts IS 'Contas bancárias e caixas por clínica.';
