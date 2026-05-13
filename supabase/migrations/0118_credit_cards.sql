-- =============================================================================
-- VetMax — Migration 0118: Cartões de Crédito/Débito por Clínica
-- G-10 Financeiro > Cadastros — Sub-aba Cartões
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.credit_cards (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID           NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name             TEXT           NOT NULL,
  administrator    TEXT,
  brand            TEXT           NOT NULL DEFAULT 'other'
                                  CHECK (brand IN ('visa','master','elo','amex','hipercard','other')),
  type             TEXT           NOT NULL DEFAULT 'credit'
                                  CHECK (type IN ('credit','debit','both')),
  installments_max INT            NOT NULL DEFAULT 1 CHECK (installments_max BETWEEN 1 AND 48),
  fee_percent      NUMERIC(5,2)   NOT NULL DEFAULT 0 CHECK (fee_percent >= 0),
  days_to_receive  INT            NOT NULL DEFAULT 30 CHECK (days_to_receive >= 0),
  is_active        BOOLEAN        NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, name)
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_clinic
  ON public.credit_cards (clinic_id);

-- ── RLS credit_cards ──────────────────────────────────────────────────────────

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_cards_select_clinic"
  ON public.credit_cards FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "credit_cards_write_admin"
  ON public.credit_cards FOR ALL
  USING (
    clinic_id = (
      SELECT clinic_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin' LIMIT 1
    )
  );

GRANT ALL    ON public.credit_cards TO service_role;
GRANT SELECT ON public.credit_cards TO authenticated;

COMMENT ON TABLE public.credit_cards IS 'Maquininhas e cartões cadastrados por clínica com taxas e prazos de recebimento.';
