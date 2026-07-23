-- ════════════════════════════════════════════════════════════════════════════
-- 0417 — Workflow da aba Recepção > Programações > Vacinas
--
-- A recepção precisa tratar a fila de próximas doses: marcar "tutor contatado"
-- e DESCARTAR programações que não serão notificadas (ex.: backlog 2022–2025
-- herdado de migração). Status por vacina, com autor e data, e ação em massa.
-- 'pending' é o default → comportamento atual preservado para toda a base.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.patient_vaccines
  ADD COLUMN IF NOT EXISTS schedule_status text NOT NULL DEFAULT 'pending'
    CHECK (schedule_status IN ('pending', 'contacted', 'dismissed')),
  ADD COLUMN IF NOT EXISTS schedule_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_status_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_patient_vaccines_schedule
  ON public.patient_vaccines (clinic_id, schedule_status)
  WHERE next_due_date IS NOT NULL;

COMMENT ON COLUMN public.patient_vaccines.schedule_status IS
  'Workflow da programação: pending (fila) | contacted (tutor avisado) | dismissed (descartada da fila).';
