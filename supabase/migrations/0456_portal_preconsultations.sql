-- 0456 — Pré-consulta pelo tutor (item 3.4c): o tutor informa a queixa e dados
-- antes de chegar; a recepção vê no check-in e aproveita no motivo da visita.
-- Sem policy de RLS: acesso só via service role (padrão das tabelas do portal).

CREATE TABLE IF NOT EXISTS portal_preconsultations (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tutor_user_id   UUID        REFERENCES tutor_users(id) ON DELETE SET NULL,
  chief_complaint TEXT        NOT NULL,               -- queixa principal
  symptoms        TEXT,                                -- sintomas observados
  duration_text   TEXT,                                -- há quanto tempo
  fasting         BOOLEAN,                             -- está em jejum? (null = não informado)
  current_meds    TEXT,                                -- medicações em uso
  notes           TEXT,                                -- observações livres
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','seen','used','archived')),
  seen_at         TIMESTAMPTZ,
  seen_by         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preconsult_patient ON portal_preconsultations (patient_id, status);
CREATE INDEX IF NOT EXISTS idx_preconsult_clinic  ON portal_preconsultations (clinic_id, status);

ALTER TABLE portal_preconsultations ENABLE ROW LEVEL SECURITY;
-- Sem policy: acesso só via service role (server actions com admin client).
