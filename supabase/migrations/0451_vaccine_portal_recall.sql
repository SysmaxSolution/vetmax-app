-- 0451 — Recall de vacina pelo portal (Fase 3): marca quando o aviso de próxima
-- dose foi enviado ao tutor (evita duplicar). Aditiva.
BEGIN;
ALTER TABLE patient_vaccines ADD COLUMN IF NOT EXISTS portal_recall_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_patient_vaccines_next_due ON patient_vaccines (next_due_date) WHERE next_due_date IS NOT NULL;
COMMIT;
