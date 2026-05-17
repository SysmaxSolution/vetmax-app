-- =============================================================================
-- VetMax — Migration 0162: petlove_remittance_lines
-- Sprint 1 (Petlove Reconciliation) — Linha por procedimento.
--
-- 1 remessa → N linhas (uma por procedimento). As colunas *_raw armazenam
-- exatamente o que veio da planilha (auditoria e reprocessamento).
-- O motor de match (Sprint 2) atualiza match_status / matched_*_id.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS petlove_remittance_lines (
  id                       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                UUID           NOT NULL REFERENCES clinics(id)             ON DELETE CASCADE,
  remittance_id            UUID           NOT NULL REFERENCES petlove_remittances(id) ON DELETE CASCADE,

  -- ─── Dados crus da planilha (auditoria, nunca alterar após import) ──────────
  external_appointment_id  TEXT           NOT NULL,
  service_date             DATE           NOT NULL,
  tutor_name_raw           TEXT,
  pet_name_raw             TEXT,
  species_raw              TEXT,
  breed_raw                TEXT,
  plan_name_raw            TEXT,
  microchip_raw            TEXT,
  membership_id_raw        TEXT,
  veterinarian_raw         TEXT,
  procedure_name_raw       TEXT,
  repass_value             NUMERIC(10,2)  NOT NULL DEFAULT 0,
  coparticipation_value    NUMERIC(10,2)  NOT NULL DEFAULT 0,

  -- ─── Resultado do matching (atualizado em Sprint 2) ─────────────────────────
  match_status             TEXT           NOT NULL DEFAULT 'pending'
                                          CHECK (match_status IN (
                                            'pending',
                                            'matched',
                                            'partial',
                                            'orphan',
                                            'duplicated',
                                            'manual_resolved',
                                            'ignored'
                                          )),
  match_confidence         SMALLINT       CHECK (match_confidence IS NULL OR (match_confidence BETWEEN 0 AND 100)),
  matched_invoice_item_id  UUID           REFERENCES invoice_items(id) ON DELETE SET NULL,
  matched_patient_id       UUID           REFERENCES patients(id)      ON DELETE SET NULL,
  matched_tutor_id         UUID           REFERENCES tutors(id)        ON DELETE SET NULL,
  match_notes              JSONB          NOT NULL DEFAULT '[]'::jsonb,

  resolution_action        TEXT,
  resolved_at              TIMESTAMPTZ,
  resolved_by              UUID           REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at               TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_petlove_lines_remittance
  ON petlove_remittance_lines (remittance_id);

CREATE INDEX IF NOT EXISTS idx_petlove_lines_clinic_status
  ON petlove_remittance_lines (clinic_id, match_status);

CREATE INDEX IF NOT EXISTS idx_petlove_lines_microchip
  ON petlove_remittance_lines (clinic_id, microchip_raw)
  WHERE microchip_raw IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_petlove_lines_external_appt
  ON petlove_remittance_lines (clinic_id, external_appointment_id);

CREATE INDEX IF NOT EXISTS idx_petlove_lines_service_date
  ON petlove_remittance_lines (clinic_id, service_date);

ALTER TABLE petlove_remittance_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_petlove_remittance_lines" ON petlove_remittance_lines;
CREATE POLICY "clinic_isolation_petlove_remittance_lines"
  ON petlove_remittance_lines FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE petlove_remittance_lines IS
  'Cada linha do extrato da remessa Petlove (um procedimento). Os campos *_raw preservam o conteúdo original da planilha; matched_* são preenchidos pelo motor de matching.';

COMMIT;
