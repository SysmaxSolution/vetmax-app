-- =============================================================================
-- VetMax — Migration 0179: professional_unavailabilities
-- Registra bloqueios de agenda (eventos, indisponibilidades) por profissional.
--
-- Cada linha representa um bloco contínuo (starts_at → ends_at). O modal de
-- "Evento" da Agenda explode múltiplas datas e múltiplos horários em várias
-- linhas no momento do INSERT (uma linha por par data×horário).
--
-- Para recorrência (daily/weekly/monthly/yearly) a linha base armazena o
-- padrão; a expansão dentro de um range é feita no read (server action).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS professional_unavailabilities (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID         NOT NULL REFERENCES clinics(id)  ON DELETE CASCADE,
  professional_id  UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title            TEXT,
  notes            TEXT,

  starts_at        TIMESTAMPTZ  NOT NULL,
  ends_at          TIMESTAMPTZ  NOT NULL,

  recurrence       TEXT         NOT NULL DEFAULT 'none'
                                CHECK (recurrence IN ('none','daily','weekly','monthly','yearly')),
  recurrence_until DATE,

  created_by       UUID         REFERENCES profiles(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_unavail_clinic_prof_starts
  ON professional_unavailabilities (clinic_id, professional_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_unavail_clinic_range
  ON professional_unavailabilities (clinic_id, starts_at, ends_at);

ALTER TABLE professional_unavailabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_professional_unavailabilities"
  ON professional_unavailabilities;
CREATE POLICY "clinic_isolation_professional_unavailabilities"
  ON professional_unavailabilities FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE professional_unavailabilities IS
  'Bloqueios/eventos de agenda por profissional. Suporta recorrência simples expandida no read.';

COMMIT;
