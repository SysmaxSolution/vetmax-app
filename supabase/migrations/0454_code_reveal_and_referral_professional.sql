-- 0454 — (1) guardar o código cifrado p/ reexibir mascarado (além do hash de
-- verificação); (2) MV solicitante da clínica parceira no check-in (consulta/OS).
-- Aditiva + idempotente.
BEGIN;
ALTER TABLE tutor_users                 ADD COLUMN IF NOT EXISTS access_code_enc text;
ALTER TABLE partner_clinics             ADD COLUMN IF NOT EXISTS code_enc text;
ALTER TABLE partner_clinic_professionals ADD COLUMN IF NOT EXISTS code_enc text;
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS referring_professional_id uuid REFERENCES partner_clinic_professionals(id) ON DELETE SET NULL;
COMMIT;
