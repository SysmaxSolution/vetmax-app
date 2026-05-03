-- Sprint: Drag-and-Drop com Log de Histórico e Fluxo de Alta Inteligente
-- Cria tabela de log de movimentações e adiciona status revisao_pos_internacao

-- ─── Tabela de Log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hospitalization_logs (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id           UUID        NOT NULL REFERENCES clinics(id)          ON DELETE CASCADE,
  hospitalization_id  UUID        NOT NULL REFERENCES hospitalizations(id) ON DELETE CASCADE,
  user_name           TEXT        NOT NULL,
  from_status         TEXT        NOT NULL,
  to_status           TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospitalization_logs_hosp
  ON hospitalization_logs (hospitalization_id);

CREATE INDEX IF NOT EXISTS idx_hospitalization_logs_clinic_time
  ON hospitalization_logs (clinic_id, created_at DESC);

ALTER TABLE hospitalization_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinic_isolation"
  ON hospitalization_logs FOR ALL
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ─── Adicionar revisao_pos_internacao ao status de consultations ───────────────

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'consultations'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%hospitalized%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE consultations DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE consultations
  ADD CONSTRAINT consultations_status_check CHECK (status IN (
    'scheduled_future',
    'reception',
    'scheduled',
    'triage',
    'in_progress',
    'waiting_exam',
    'medication',
    'completed',
    'cancelled',
    'hospitalized',
    'revisao_pos_internacao'
  ));
