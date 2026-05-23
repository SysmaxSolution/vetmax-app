-- =============================================================================
-- VetMax — Migration 0185: prescrições de internação + administrações
-- Épico 2.6 — Scheduler de medicação na Internação.
--
-- Duas tabelas, papéis distintos:
--   hospitalization_prescriptions       → o PLANO (regra: "Dipirona 6/6h por 48h")
--   hospitalization_dose_administrations → o FATO (cada dose efetivamente aplicada)
--
-- O next_dose_at é DERIVADO no cliente:
--   next = max(applied_at) da prescription + frequency_hours
--        OU started_at + frequency_hours  (se ainda não foi aplicada)
-- Evita trigger + jobs de DB; o useSyncExternalStore do hook recalcula a cada
-- 15s e em todo onLine/visibilitychange.
-- =============================================================================

BEGIN;

-- ─── PRESCRIÇÕES (plano) ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hospitalization_prescriptions (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID         NOT NULL REFERENCES clinics(id)         ON DELETE CASCADE,
  hospitalization_id UUID         NOT NULL REFERENCES hospitalizations(id) ON DELETE CASCADE,

  medication_name    TEXT         NOT NULL,
  dose               TEXT,
  route              TEXT,

  /** Intervalo entre doses em HORAS (numérico, vem de dropdown — sem texto
   *  livre tipo "8/8h"). NULL = dose única (SOS), o scheduler não agenda. */
  frequency_hours    NUMERIC(5,2) CHECK (frequency_hours IS NULL OR frequency_hours > 0),

  /** Início do ciclo — primeira dose programada a partir daqui. */
  started_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  /** Duração total da prescrição em horas. NULL = sem fim definido (vale até
   *  alta hospitalar ou status mudar para 'finished'). */
  duration_hours     INT          CHECK (duration_hours IS NULL OR duration_hours > 0),

  /** 'active' = scheduler alerta; 'paused' = pausa temporária (não alerta,
   *  preserva histórico); 'finished' = concluída, scheduler ignora. */
  status             TEXT         NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'paused', 'finished')),

  notes              TEXT,
  prescribed_by      UUID         REFERENCES profiles(id),

  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hosp_presc_active
  ON hospitalization_prescriptions (clinic_id, hospitalization_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_hosp_presc_hosp
  ON hospitalization_prescriptions (hospitalization_id);

ALTER TABLE hospitalization_prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_hospitalization_prescriptions"
  ON hospitalization_prescriptions;
CREATE POLICY "clinic_isolation_hospitalization_prescriptions"
  ON hospitalization_prescriptions FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE hospitalization_prescriptions IS
  'Plano de prescrição do paciente internado. status=active alimenta o useMedicationScheduler do Kanban.';

-- ─── ADMINISTRAÇÕES (fato) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hospitalization_dose_administrations (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID         NOT NULL REFERENCES clinics(id)               ON DELETE CASCADE,
  hospitalization_id UUID         NOT NULL REFERENCES hospitalizations(id)       ON DELETE CASCADE,
  prescription_id    UUID         NOT NULL REFERENCES hospitalization_prescriptions(id) ON DELETE CASCADE,

  /** Quando a dose foi efetivamente aplicada. */
  applied_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  applied_by         UUID         REFERENCES profiles(id),

  /** Quando a dose ESTAVA programada — útil quando o registro é feito
   *  atrasado (auditoria de aderência ao plano). NULL se foi pontual. */
  scheduled_for      TIMESTAMPTZ,

  notes              TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hosp_dose_presc_applied
  ON hospitalization_dose_administrations (prescription_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_hosp_dose_hosp
  ON hospitalization_dose_administrations (hospitalization_id);

ALTER TABLE hospitalization_dose_administrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_hospitalization_dose_administrations"
  ON hospitalization_dose_administrations;
CREATE POLICY "clinic_isolation_hospitalization_dose_administrations"
  ON hospitalization_dose_administrations FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE hospitalization_dose_administrations IS
  'Cada dose efetivamente aplicada. MAX(applied_at) por prescription_id alimenta o cálculo de next_dose_at client-side.';

-- ─── Touch updated_at na prescrição ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_touch_hospitalization_prescriptions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hosp_presc_updated_at ON hospitalization_prescriptions;
CREATE TRIGGER trg_hosp_presc_updated_at
  BEFORE UPDATE ON hospitalization_prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION fn_touch_hospitalization_prescriptions_updated_at();

COMMIT;
