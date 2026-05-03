-- =============================================================================
-- VetMax — Migration 0063: Controlled Medication Prescription Validation
--
-- CFMV Resolução 1.138/2016 + Lei 5.991/1973 (Medicamentos Controlados)
--
-- 1. Adiciona is_controlled, prescription_type a prescriptions e
--    applied_medications
-- 2. Adiciona prescriber_crmv e vet_signature_required para rastreabilidade
-- 3. CHECK constraint: medicamento controlado EXIGE crmv válido do prescritor
-- 4. Função RPC: rpc_create_controlled_prescription
-- 5. Relatório de auditoria para medicamentos controlados
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Estender tabela prescriptions com campos CFMV
-- =========================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS is_controlled            BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prescription_type        TEXT       DEFAULT 'standard'
    CHECK (prescription_type IN ('standard', 'blue_receipt', 'yellow_receipt', 'special')),
  ADD COLUMN IF NOT EXISTS prescriber_id            UUID       REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS prescriber_crmv          TEXT,
  ADD COLUMN IF NOT EXISTS frequency                TEXT,
  ADD COLUMN IF NOT EXISTS duration_days            INTEGER    CHECK (duration_days > 0),
  ADD COLUMN IF NOT EXISTS vet_signed_at            TIMESTAMPTZ;

COMMENT ON COLUMN prescriptions.is_controlled       IS 'CFMV: indica medicamento sujeito a receituário especial';
COMMENT ON COLUMN prescriptions.prescription_type   IS 'CFMV: tipo de receituário. blue_receipt=Receituário Azul (controlados), yellow_receipt=Amarelo, standard=padrão';
COMMENT ON COLUMN prescriptions.prescriber_crmv     IS 'CFMV: CRMV do MV no momento da prescrição (snapshot imutável para auditoria)';
COMMENT ON COLUMN prescriptions.frequency           IS 'CFMV: posologia — frequência de administração';
COMMENT ON COLUMN prescriptions.duration_days       IS 'CFMV: duração do tratamento em dias';
COMMENT ON COLUMN prescriptions.vet_signed_at       IS 'CFMV: timestamp da assinatura digital do MV na receita';

-- =========================================================================
-- 2. Estender applied_medications com flag de controlado
-- =========================================================================

ALTER TABLE applied_medications
  ADD COLUMN IF NOT EXISTS is_controlled     BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prescriber_crmv   TEXT,
  ADD COLUMN IF NOT EXISTS requires_receipt  BOOLEAN   NOT NULL DEFAULT false;

COMMENT ON COLUMN applied_medications.is_controlled    IS 'CFMV: medicamento controlado aplicado em clínica — exige CRMV válido do prescrito';
COMMENT ON COLUMN applied_medications.prescriber_crmv  IS 'CFMV: CRMV do MV autorizante (snapshot)';
COMMENT ON COLUMN applied_medications.requires_receipt IS 'CFMV: se true, gera receituário azul antes de dispensação';

-- =========================================================================
-- 3. CHECK: medicamento controlado EXIGE prescriber_crmv preenchido
-- =========================================================================

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS chk_controlled_requires_crmv;

ALTER TABLE prescriptions
  ADD CONSTRAINT chk_controlled_requires_crmv
  CHECK (
    NOT is_controlled
    OR (
      prescriber_crmv IS NOT NULL
      AND prescriber_crmv ~* '^[A-Z]{2}[0-9]{4,10}$'
    )
  );

COMMENT ON CONSTRAINT chk_controlled_requires_crmv ON prescriptions IS
  'CFMV/Lei 5.991: prescrição de controlado EXIGE CRMV válido do prescritor. Formato: UF + 4-10 dígitos.';

-- =========================================================================
-- 4. Função RPC: criar prescrição (com ou sem controlado)
-- =========================================================================

CREATE OR REPLACE FUNCTION rpc_create_prescription(
  p_clinic_id        UUID,
  p_consultation_id  UUID,
  p_medication       TEXT,
  p_dose             TEXT          DEFAULT NULL,
  p_frequency        TEXT          DEFAULT NULL,
  p_duration_days    INTEGER       DEFAULT NULL,
  p_is_controlled    BOOLEAN       DEFAULT false,
  p_prescription_type TEXT         DEFAULT 'standard'
)
RETURNS JSONB AS $$
DECLARE
  v_prescriber_id    UUID;
  v_prescriber_crmv  TEXT;
  v_caller_clinic    UUID;
  v_caller_role      TEXT;
  v_rx_id            UUID;
BEGIN
  -- Busca dados do usuário autenticado
  SELECT id, role, clinic_id, crmv
  INTO v_prescriber_id, v_caller_role, v_caller_clinic, v_prescriber_crmv
  FROM profiles WHERE id = auth.uid();

  -- Validações básicas
  IF v_caller_clinic IS DISTINCT FROM p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido';
  END IF;

  IF v_caller_role NOT IN ('vet', 'admin', 'owner') THEN
    RAISE EXCEPTION 'Apenas médicos veterinários podem criar prescrições';
  END IF;

  -- Validação CFMV para controlados
  IF p_is_controlled THEN
    IF v_prescriber_crmv IS NULL OR NOT v_prescriber_crmv ~* '^[A-Z]{2}[0-9]{4,10}$' THEN
      RAISE EXCEPTION 'CFMV: prescrição de medicamento controlado exige CRMV válido. '
        'Cadastre o CRMV em Gestão → Equipe antes de prescrever controlados.';
    END IF;
  END IF;

  -- Insere prescrição
  INSERT INTO prescriptions (
    clinic_id,
    consultation_id,
    medication,
    dose,
    frequency,
    duration_days,
    is_controlled,
    prescription_type,
    prescriber_id,
    prescriber_crmv,
    vet_signed_at
  ) VALUES (
    p_clinic_id,
    p_consultation_id,
    p_medication,
    p_dose,
    p_frequency,
    p_duration_days,
    p_is_controlled,
    CASE
      WHEN p_is_controlled AND p_prescription_type = 'standard' THEN 'blue_receipt'
      ELSE p_prescription_type
    END,
    v_prescriber_id,
    CASE WHEN p_is_controlled THEN v_prescriber_crmv ELSE NULL END,
    CASE WHEN p_is_controlled THEN NOW() ELSE NULL END
  ) RETURNING id INTO v_rx_id;

  RETURN jsonb_build_object(
    'success',           true,
    'prescription_id',   v_rx_id,
    'is_controlled',     p_is_controlled,
    'prescription_type', CASE WHEN p_is_controlled THEN 'blue_receipt' ELSE p_prescription_type END,
    'prescriber_crmv',   CASE WHEN p_is_controlled THEN v_prescriber_crmv ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_create_prescription IS
  'CFMV/Lei 5.991: cria prescrição. Medicamentos controlados exigem CRMV válido do prescritor. '
  'Automaticamente define prescription_type=blue_receipt para controlados.';

-- =========================================================================
-- 5. Índices para auditoria CFMV
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_prescriptions_controlled
  ON prescriptions (clinic_id, is_controlled, created_at DESC)
  WHERE is_controlled = true;

CREATE INDEX IF NOT EXISTS idx_prescriptions_prescriber
  ON prescriptions (prescriber_id, clinic_id);

CREATE INDEX IF NOT EXISTS idx_applied_medications_controlled
  ON applied_medications (clinic_id, is_controlled, created_at DESC)
  WHERE is_controlled = true;

-- =========================================================================
-- 6. View de auditoria CFMV: prescrições controladas sem CRMV (alerta)
-- =========================================================================

CREATE OR REPLACE VIEW audit_controlled_without_crmv AS
  SELECT
    p.id,
    p.clinic_id,
    p.consultation_id,
    p.medication,
    p.prescriber_id,
    p.prescriber_crmv,
    p.created_at
  FROM prescriptions p
  WHERE p.is_controlled = true
    AND (p.prescriber_crmv IS NULL OR p.prescriber_crmv = '');

COMMENT ON VIEW audit_controlled_without_crmv IS
  'CFMV: prescrições de controlados SEM CRMV. Devem ser zero. Monitorar periodicamente.';

COMMIT;
