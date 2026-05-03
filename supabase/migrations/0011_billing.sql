-- ─── Migration 0011: Módulo de Faturamento ────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id              UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       UUID           NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  consultation_id UUID           NOT NULL UNIQUE REFERENCES consultations(id) ON DELETE CASCADE,
  patient_id      UUID           NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tutor_id        UUID           NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  subtotal        NUMERIC(10,2)  NOT NULL DEFAULT 0,
  discount        NUMERIC(10,2)  NOT NULL DEFAULT 0,
  total_amount    NUMERIC(10,2)  NOT NULL DEFAULT 0,
  status          TEXT           NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_method  TEXT           CHECK (payment_method IN ('pix', 'credit', 'debit', 'cash')),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id           UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id   UUID           NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_type    TEXT           NOT NULL CHECK (item_type IN ('consultation', 'medication', 'exam', 'other')),
  description  TEXT           NOT NULL,
  quantity     INTEGER        NOT NULL DEFAULT 1,
  unit_price   NUMERIC(10,2)  NOT NULL,
  total_price  NUMERIC(10,2)  NOT NULL,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ─── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_invoices_clinic_status   ON invoices (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_consultation    ON invoices (consultation_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice    ON invoice_items (invoice_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- invoices: cada clínica vê apenas suas faturas
CREATE POLICY "invoices_select" ON invoices FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "invoices_insert" ON invoices FOR INSERT
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "invoices_update" ON invoices FOR UPDATE
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

-- invoice_items: herdado via invoice
CREATE POLICY "invoice_items_select" ON invoice_items FOR SELECT
  USING (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "invoice_items_insert" ON invoice_items FOR INSERT
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    )
  );
