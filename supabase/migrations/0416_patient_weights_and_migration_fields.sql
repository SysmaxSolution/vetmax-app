-- ════════════════════════════════════════════════════════════════════════════
-- 0416 — Histórico de peso + campos p/ migração SimplesVet (Almavet)
--
-- 1) patient_weights: histórico de pesagens com escore corporal (BCS).
--    Hoje só guardamos o "último peso" (patients.last_known_weight) e o peso
--    por consulta. A curva de peso é dado clínico primário (2.306 registros
--    na migração da Almavet) e vira feature para todas as clínicas.
-- 2) Campos aditivos: tutors.rg, tutors.birth_date (termos CFMV/identificação),
--    patients.size (porte P/M/G — banho/tosa e dosagem).
-- 3) migration_id_map: staging de-para de migrações de sistemas legados
--    (objectId de origem → UUID nosso). Garante idempotência (re-execução sem
--    duplicar) e viabiliza carga em 2 ondas (inicial + delta na virada).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Histórico de peso ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_weights (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES public.clinics(id),
  patient_id   uuid NOT NULL REFERENCES public.patients(id),
  weight_kg    numeric(6,3) NOT NULL CHECK (weight_kg > 0),
  body_score   smallint CHECK (body_score BETWEEN 1 AND 9),
  measured_at  timestamptz NOT NULL DEFAULT now(),
  source       text NOT NULL DEFAULT 'manual',  -- manual | triage | consultation | migracao_simplesvet
  notes        text,
  recorded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_weights_patient
  ON public.patient_weights (patient_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_weights_clinic
  ON public.patient_weights (clinic_id);

ALTER TABLE public.patient_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_weights_select ON public.patient_weights;
CREATE POLICY patient_weights_select ON public.patient_weights
  FOR SELECT USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS patient_weights_insert ON public.patient_weights;
CREATE POLICY patient_weights_insert ON public.patient_weights
  FOR INSERT WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS patient_weights_update ON public.patient_weights;
CREATE POLICY patient_weights_update ON public.patient_weights
  FOR UPDATE USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE public.patient_weights IS
  'Histórico de pesagens do pet (peso + escore corporal 1-9). Fontes: triagem, consulta, manual, migração.';

-- ── 2. Campos aditivos ───────────────────────────────────────────────────────
ALTER TABLE public.tutors
  ADD COLUMN IF NOT EXISTS rg          text,
  ADD COLUMN IF NOT EXISTS birth_date  date,
  ADD COLUMN IF NOT EXISTS notes       text;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS size text
  CHECK (size IS NULL OR size IN ('mini', 'small', 'medium', 'large', 'giant'));

COMMENT ON COLUMN public.patients.size IS 'Porte: mini/small/medium/large/giant (livre mapeamento de legados).';

-- ── 3. Staging de migração ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.migration_id_map (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES public.clinics(id),
  source_system text NOT NULL,          -- ex.: 'simplesvet'
  entity        text NOT NULL,          -- ex.: 'tutor', 'patient', 'consultation'
  source_id     text NOT NULL,          -- objectId no sistema de origem
  target_table  text NOT NULL,
  target_id     uuid NOT NULL,
  matched_by    text,                   -- 'cpf' | 'name_tutor' | 'created' | ...
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT migration_id_map_unique UNIQUE (clinic_id, source_system, entity, source_id)
);

CREATE INDEX IF NOT EXISTS idx_migration_id_map_lookup
  ON public.migration_id_map (source_system, entity, source_id);

-- Tabela de sistema: RLS ligado sem policies (apenas service_role acessa).
ALTER TABLE public.migration_id_map ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.migration_id_map IS
  'De-para de migrações de sistemas legados. Idempotência do ETL e suporte a carga em 2 ondas.';

-- ── 4. inclusion_source: aceitar consultas de migração de legado ─────────────
ALTER TABLE public.consultations
  DROP CONSTRAINT IF EXISTS consultations_inclusion_source_check;
ALTER TABLE public.consultations
  ADD CONSTRAINT consultations_inclusion_source_check
  CHECK (inclusion_source IN ('direct_inclusion', 'reception_checkin', 'triage_referral', 'legacy_migration'));
