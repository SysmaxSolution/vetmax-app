-- 0361 — Módulo Faturamento: Orçamento de Serviços (O.S.) + NFS-e
--
-- Sprint "Faturamento" (08/06/2026). Fase 1: núcleo de documentos comerciais.
--   - billing_documents: O.S. e NFS-e na MESMA tabela (doc_type discrimina)
--   - billing_document_items: linhas (reusa catálogo stock_items)
--   - billing_document_sequences + rpc_next_billing_number: numeração atômica
--     por clínica+tipo (não-duplicidade — requisito explícito)
--
-- Multi-tenant: clinic_id + RLS por clínica via
-- (SELECT clinic_id FROM profiles WHERE id = auth.uid()) — padrão do repo
-- (0011_billing.sql, 0358_patient_notes...). O JWT NÃO carrega clinic_id.
-- RLS de itens valida o tenant pelo DOCUMENTO-PAI (correção do plano).
-- Migration aditiva, IF NOT EXISTS.

BEGIN;

-- ─── 1. billing_documents (núcleo) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doc_type            TEXT NOT NULL DEFAULT 'orcamento'
    CHECK (doc_type IN ('orcamento', 'nfse')),
  doc_number          TEXT NOT NULL,                          -- ORC-2026-0001 / NFSE-2026-0001
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','billed','cancelled','processing','authorized','rejected')),
  is_billed           BOOLEAN NOT NULL DEFAULT FALSE,
  issue_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billed_date         TIMESTAMPTZ,
  valid_until         DATE,
  tutor_id            UUID REFERENCES tutors(id)   ON DELETE SET NULL,
  patient_id          UUID REFERENCES patients(id) ON DELETE SET NULL,
  professional_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  related_document_id UUID REFERENCES billing_documents(id) ON DELETE SET NULL,
  consultation_id     UUID REFERENCES consultations(id) ON DELETE SET NULL,
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,     -- snapshot imutável p/ reimpressão
  pdf_path            TEXT,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_billing_documents_number
  ON billing_documents (clinic_id, doc_type, doc_number);
CREATE INDEX IF NOT EXISTS idx_billing_documents_clinic_issue
  ON billing_documents (clinic_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_documents_tutor   ON billing_documents (clinic_id, tutor_id);
CREATE INDEX IF NOT EXISTS idx_billing_documents_patient ON billing_documents (clinic_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_documents_status  ON billing_documents (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_documents_consult ON billing_documents (consultation_id)
  WHERE consultation_id IS NOT NULL;
-- Pendências do tutor (badge da Recepção — Fase 2): orçamentos em aberto
CREATE INDEX IF NOT EXISTS idx_billing_documents_open_quotes
  ON billing_documents (clinic_id, tutor_id, status)
  WHERE doc_type = 'orcamento' AND status IN ('draft','sent');

ALTER TABLE billing_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_documents_clinic_select ON billing_documents;
DROP POLICY IF EXISTS billing_documents_clinic_write  ON billing_documents;

CREATE POLICY billing_documents_clinic_select ON billing_documents
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY billing_documents_clinic_write ON billing_documents
  FOR ALL TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ─── 2. billing_document_items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_document_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  document_id   UUID NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
  stock_item_id UUID REFERENCES stock_items(id) ON DELETE SET NULL,   -- catálogo (snapshot abaixo)
  description   TEXT NOT NULL,                                        -- nome no momento (imutável)
  quantity      NUMERIC(10,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_items_document ON billing_document_items (document_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_billing_items_clinic   ON billing_document_items (clinic_id);

ALTER TABLE billing_document_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_items_clinic_select ON billing_document_items;
DROP POLICY IF EXISTS billing_items_clinic_write  ON billing_document_items;

-- SELECT: tenant pelo documento-pai (correção) + espelho clinic_id consistente
CREATE POLICY billing_items_clinic_select ON billing_document_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM billing_documents d
       WHERE d.id = billing_document_items.document_id
         AND d.clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    )
  );

-- INSERT/UPDATE/DELETE: valida o tenant pelo documento-pai — ninguém insere
-- item em documento de outra clínica.
CREATE POLICY billing_items_clinic_write ON billing_document_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM billing_documents d
       WHERE d.id = billing_document_items.document_id
         AND d.clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM billing_documents d
       WHERE d.id = billing_document_items.document_id
         AND d.clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ─── 3. Numeração atômica ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_document_sequences (
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('orcamento','nfse')),
  last_number INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, doc_type)
);

ALTER TABLE billing_document_sequences ENABLE ROW LEVEL SECURITY;
-- Sem policies de escrita: alterada SÓ via RPC SECURITY DEFINER. SELECT opcional.
DROP POLICY IF EXISTS billing_sequences_clinic_select ON billing_document_sequences;
CREATE POLICY billing_sequences_clinic_select ON billing_document_sequences
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- RPC atômica: incrementa e retorna o doc_number formatado (ORC-AAAA-NNNN).
-- UPDATE ... RETURNING garante não-duplicidade sob concorrência.
CREATE OR REPLACE FUNCTION rpc_next_billing_number(p_clinic_id UUID, p_doc_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next   INT;
  v_prefix TEXT;
  v_year   TEXT := to_char(NOW(), 'YYYY');
BEGIN
  IF p_doc_type NOT IN ('orcamento','nfse') THEN
    RAISE EXCEPTION 'doc_type inválido: %', p_doc_type;
  END IF;
  -- Caller deve pertencer à clínica (defense-in-depth no SECURITY DEFINER)
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado à clínica';
  END IF;

  INSERT INTO billing_document_sequences (clinic_id, doc_type, last_number)
       VALUES (p_clinic_id, p_doc_type, 1)
  ON CONFLICT (clinic_id, doc_type)
  DO UPDATE SET last_number = billing_document_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  v_prefix := CASE p_doc_type WHEN 'orcamento' THEN 'ORC' ELSE 'NFSE' END;
  RETURN v_prefix || '-' || v_year || '-' || lpad(v_next::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_next_billing_number(UUID, TEXT) TO authenticated;

-- updated_at automático em billing_documents
CREATE OR REPLACE FUNCTION fn_billing_documents_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_billing_documents_touch ON billing_documents;
CREATE TRIGGER trg_billing_documents_touch
  BEFORE UPDATE ON billing_documents
  FOR EACH ROW EXECUTE FUNCTION fn_billing_documents_touch();

COMMIT;
