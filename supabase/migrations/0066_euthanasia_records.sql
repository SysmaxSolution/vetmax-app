-- Migration 0066: Registros de Eutanásia (CFMV Resolução 1.138/2016)
-- CFMV Art. 14: documentação obrigatória com consentimento do tutor e assinatura do MV
-- Reversível: DROP TABLE IF EXISTS euthanasia_records;

-- ─── Tabela principal ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS euthanasia_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  tutor_id              UUID NOT NULL REFERENCES tutors(id) ON DELETE RESTRICT,
  vet_id                UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,

  -- Dados clínicos obrigatórios (CFMV)
  reason                TEXT NOT NULL CHECK (char_length(reason) >= 10),
  method                TEXT NOT NULL CHECK (method IN (
    'pentobarbital_sodium',
    't61',
    'potassium_chloride_ga',
    'inhalation_co2',
    'other'
  )),
  method_details        TEXT,                      -- obrigatório quando method='other'

  -- Diagnóstico que justifica o procedimento
  diagnosis             TEXT,
  clinical_notes        TEXT,

  -- Consentimento do tutor (LGPD Art. 7 + CFMV)
  tutor_consent_signed  BOOLEAN NOT NULL DEFAULT false,
  consent_signed_at     TIMESTAMPTZ,
  consent_ip            INET,
  consent_method        TEXT CHECK (consent_method IN ('digital','paper','verbal_emergency')),

  -- Testemunha (boa prática CFMV)
  witness_name          TEXT,
  witness_role          TEXT,

  -- Assinatura do MV (CFMV obrigatório)
  vet_crmv              TEXT NOT NULL CHECK (vet_crmv ~* '^[A-Z]{2}[0-9]{4,10}$'),
  vet_signed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Metadados
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES profiles(id),

  -- Constraints de integridade
  CONSTRAINT chk_consent_requires_date
    CHECK (NOT tutor_consent_signed OR consent_signed_at IS NOT NULL),
  CONSTRAINT chk_other_requires_details
    CHECK (method != 'other' OR method_details IS NOT NULL)
);

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_euthanasia_records_clinic
  ON euthanasia_records(clinic_id);

CREATE INDEX IF NOT EXISTS idx_euthanasia_records_patient
  ON euthanasia_records(patient_id);

CREATE INDEX IF NOT EXISTS idx_euthanasia_records_vet
  ON euthanasia_records(vet_id, performed_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE euthanasia_records ENABLE ROW LEVEL SECURITY;

-- Admin/owner/manager/vet: leitura dentro da clínica
CREATE POLICY "euthanasia_select_clinic_staff"
  ON euthanasia_records FOR SELECT
  USING (
    clinic_id = (
      SELECT clinic_id FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'manager', 'vet')
    )
  );

-- Somente vet pode inserir (CFMV: obrigatório MV responsável)
CREATE POLICY "euthanasia_insert_vet_only"
  ON euthanasia_records FOR INSERT
  WITH CHECK (
    clinic_id = (
      SELECT clinic_id FROM profiles
      WHERE id = auth.uid()
      AND role IN ('vet', 'admin', 'owner')
    )
    AND vet_id = auth.uid()
  );

-- Nenhum UPDATE/DELETE — registros imutáveis (CFMV auditoria)

-- ─── Função: registrar eutanásia (transacional) ───────────────────────────────

CREATE OR REPLACE FUNCTION rpc_record_euthanasia(
  p_clinic_id           UUID,
  p_patient_id          UUID,
  p_tutor_id            UUID,
  p_reason              TEXT,
  p_method              TEXT,
  p_method_details      TEXT DEFAULT NULL,
  p_diagnosis           TEXT DEFAULT NULL,
  p_clinical_notes      TEXT DEFAULT NULL,
  p_tutor_consent       BOOLEAN DEFAULT false,
  p_consent_method      TEXT DEFAULT 'digital',
  p_witness_name        TEXT DEFAULT NULL,
  p_witness_role        TEXT DEFAULT NULL,
  p_notes               TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vet_id   UUID;
  v_crmv     TEXT;
  v_record   euthanasia_records;
BEGIN
  -- Buscar vet_id e crmv do usuário atual
  SELECT id, crmv INTO v_vet_id, v_crmv
  FROM profiles
  WHERE id = auth.uid()
    AND clinic_id = p_clinic_id
    AND role IN ('vet', 'admin', 'owner');

  IF v_vet_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não é veterinário nesta clínica';
  END IF;

  IF v_crmv IS NULL THEN
    RAISE EXCEPTION 'CRMV não cadastrado. Registre o CRMV antes de executar eutanásia.';
  END IF;

  -- Validar método 'other' exige detalhes
  IF p_method = 'other' AND p_method_details IS NULL THEN
    RAISE EXCEPTION 'Método "other" requer descrição em method_details';
  END IF;

  -- Inserir registro imutável
  INSERT INTO euthanasia_records (
    clinic_id, patient_id, tutor_id, vet_id, vet_crmv,
    reason, method, method_details, diagnosis, clinical_notes,
    tutor_consent_signed, consent_signed_at, consent_method,
    witness_name, witness_role, notes, created_by
  ) VALUES (
    p_clinic_id, p_patient_id, p_tutor_id, v_vet_id, v_crmv,
    p_reason, p_method, p_method_details, p_diagnosis, p_clinical_notes,
    p_tutor_consent,
    CASE WHEN p_tutor_consent THEN now() ELSE NULL END,
    p_consent_method,
    p_witness_name, p_witness_role, p_notes, auth.uid()
  )
  RETURNING * INTO v_record;

  -- Log de auditoria (LGPD Art. 37 — rastreabilidade)
  INSERT INTO audit_logs (clinic_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    p_clinic_id, auth.uid(), 'euthanasia_recorded', 'pets', p_patient_id,
    jsonb_build_object(
      'euthanasia_id', v_record.id,
      'method', p_method,
      'tutor_consent', p_tutor_consent,
      'vet_crmv', v_crmv
    )
  );

  RETURN jsonb_build_object(
    'id',             v_record.id,
    'patient_id',     v_record.patient_id,
    'performed_at',   v_record.performed_at,
    'vet_crmv',       v_record.vet_crmv,
    'consent_signed', v_record.tutor_consent_signed
  );
END;
$$;

-- ─── View: auditoria CFMV ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW audit_euthanasia_compliance AS
SELECT
  e.id,
  e.clinic_id,
  p.name              AS patient_name,
  p.species,
  t.name              AS tutor_name,
  pr.full_name        AS vet_name,
  e.vet_crmv,
  e.reason,
  e.method,
  e.tutor_consent_signed,
  e.consent_signed_at,
  e.witness_name,
  e.performed_at,
  -- Flags de conformidade
  CASE WHEN e.vet_crmv IS NULL THEN 'CRÍTICO: sem CRMV'
       WHEN NOT e.tutor_consent_signed THEN 'ATENÇÃO: sem consentimento'
       ELSE 'OK' END  AS compliance_status
FROM euthanasia_records e
JOIN patients p  ON p.id = e.patient_id
JOIN tutors   t  ON t.id = e.tutor_id
JOIN profiles pr ON pr.id = e.vet_id;

-- ─── Rollback (comentado — executar manualmente se necessário) ────────────────
-- DROP VIEW  IF EXISTS audit_euthanasia_compliance;
-- DROP FUNCTION IF EXISTS rpc_record_euthanasia;
-- DROP TABLE IF EXISTS euthanasia_records;
