-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0030 — Índices para Chaves Estrangeiras sem Cobertura
-- Gerado em: 2026-04-18
-- Motivo: 16 FKs identificadas sem índice durante Health Check, causando
--         Full Table Scan em JOINs. Nenhuma alteração destrutiva — apenas ADD.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── appointments ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id
  ON appointments(clinic_id);

CREATE INDEX IF NOT EXISTS idx_appointments_tutor_id
  ON appointments(tutor_id);

CREATE INDEX IF NOT EXISTS idx_appointments_created_by
  ON appointments(created_by);

-- ── whatsapp_notifications ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_consultation_id
  ON whatsapp_notifications(consultation_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_hospitalization_id
  ON whatsapp_notifications(hospitalization_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_sent_by
  ON whatsapp_notifications(sent_by);

-- ── invoices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_patient_id
  ON invoices(patient_id);

CREATE INDEX IF NOT EXISTS idx_invoices_tutor_id
  ON invoices(tutor_id);

-- ── patient_documents ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patient_documents_patient_id
  ON patient_documents(patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_documents_template_id
  ON patient_documents(template_id);

-- ── audit_logs ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_id
  ON audit_logs(clinic_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON audit_logs(user_id);

-- ── applied_medications ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_applied_medications_administered_by
  ON applied_medications(administered_by);

-- ── patient_vaccines ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patient_vaccines_administered_by
  ON patient_vaccines(administered_by);

-- ── patient_attachments ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patient_attachments_uploaded_by
  ON patient_attachments(uploaded_by);

-- ── hospitalization_documents ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hospitalization_documents_user_id
  ON hospitalization_documents(user_id);
