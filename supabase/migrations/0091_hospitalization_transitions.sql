-- Migration 0091: Regras de transição automática de internação (I-01)
-- Permite configurar quais transições de status acontecem automaticamente
-- com base no status de evolução clínica registrado.

CREATE TABLE IF NOT EXISTS hospitalization_transitions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  from_status     text        NOT NULL,
  evolution_status text       NOT NULL,  -- 'melhorou', 'estavel', 'piorou', 'critico'
  to_status       text        NOT NULL,
  enabled         boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, from_status, evolution_status)
);

CREATE INDEX IF NOT EXISTS idx_hosp_transitions_clinic
  ON hospitalization_transitions(clinic_id);

-- RLS
ALTER TABLE hospitalization_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_hosp_transitions" ON hospitalization_transitions;
CREATE POLICY "clinic_isolation_hosp_transitions"
  ON hospitalization_transitions FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());
