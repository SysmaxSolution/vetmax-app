-- =============================================================================
-- VetMax — Migration 0203: Tarefas de internação (Mapa de Execução)
--
-- Enfermagem não dá só remédio: exames, procedimentos e alimentação também são
-- aprazados. hospitalization_tasks entra na MESMA grade do Mapa de Execução,
-- ao lado das prescrições. last_done_at espelha o "última aplicação" das doses.
-- Aditiva, IF NOT EXISTS, clinic_id em tudo.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS hospitalization_tasks (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID          NOT NULL REFERENCES clinics(id)          ON DELETE CASCADE,
  hospitalization_id UUID          NOT NULL REFERENCES hospitalizations(id) ON DELETE CASCADE,
  kind               TEXT          NOT NULL CHECK (kind IN ('exam','procedure','feeding','other')),
  description        TEXT          NOT NULL,
  frequency_hours    NUMERIC(6,2),                 -- NULL = tarefa única (sem grade fixa)
  started_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  duration_hours     NUMERIC(8,2),                 -- NULL = até a alta
  last_done_at       TIMESTAMPTZ,                  -- marca a última execução (estado 'done' na grade)
  status             TEXT          NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','done')),
  notes              TEXT,
  created_by         UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hosp_tasks_hosp   ON hospitalization_tasks (hospitalization_id, status);
CREATE INDEX IF NOT EXISTS idx_hosp_tasks_clinic ON hospitalization_tasks (clinic_id);

ALTER TABLE hospitalization_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_hosp_tasks" ON hospitalization_tasks;
CREATE POLICY "clinic_isolation_hosp_tasks"
  ON hospitalization_tasks FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE hospitalization_tasks IS
  'Tarefas de enfermagem aprazadas (exame/procedimento/alimentação) que entram no Mapa de Execução ao lado das medicações.';

COMMIT;
