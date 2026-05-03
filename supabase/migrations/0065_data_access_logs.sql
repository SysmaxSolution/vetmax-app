-- =============================================================================
-- VetMax — Migration 0065: Data Access Logs (LGPD Rastreabilidade)
--
-- Complementa audit_logs (0020) com rastreabilidade específica de LGPD:
-- 1. Tabela data_access_logs — registra quem acessou quais dados pessoais
-- 2. Coluna whatsapp_consent em tutors — base legal para notificações
-- 3. Trigger: loga automaticamente acesso a prontuários (consultas/exames)
-- 4. Função: rpc_log_data_access — chamada por server actions
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Tabela de logs de acesso a dados pessoais
-- =========================================================================

CREATE TABLE IF NOT EXISTS data_access_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  accessed_by     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  data_subject_id UUID,       -- tutor_id ou patient_id (titular dos dados)
  data_type       TEXT        NOT NULL,   -- 'medical_record' | 'personal_data' | 'prescription' | 'exam_result'
  entity_type     TEXT        NOT NULL,   -- tabela: 'consultations' | 'patients' | 'tutors' | 'prescriptions'
  entity_id       UUID        NOT NULL,
  access_type     TEXT        NOT NULL DEFAULT 'read'
    CHECK (access_type IN ('read', 'write', 'export', 'delete', 'share')),
  purpose         TEXT,                   -- motivo do acesso (ex: 'atendimento', 'auditoria')
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE data_access_logs IS
  'LGPD Art. 37: rastreabilidade de acessos a dados pessoais. '
  'Marco Civil da Internet (Lei 12.965/2014): logs retidos por 6 meses mínimo.';

ALTER TABLE data_access_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admin/owner/vet da clínica podem ler (para auditoria)
CREATE POLICY "data_access_logs_select"
  ON data_access_logs FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner', 'manager', 'vet')
  );

-- Sistema insere (SECURITY DEFINER nas funções)
CREATE POLICY "data_access_logs_insert"
  ON data_access_logs FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_data_access_logs_subject
  ON data_access_logs (clinic_id, data_subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_access_logs_accessor
  ON data_access_logs (accessed_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_access_logs_entity
  ON data_access_logs (entity_type, entity_id, created_at DESC);

-- =========================================================================
-- 2. Coluna whatsapp_consent em tutors (base legal LGPD para notificações)
-- =========================================================================

ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS whatsapp_consent          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_version  TEXT        DEFAULT '1.0';

COMMENT ON COLUMN tutors.whatsapp_consent IS
  'LGPD Art. 7, I: consentimento específico para envio de mensagens via WhatsApp/SMS. '
  'Separado do consent_given geral — consentimento granular conforme LGPD.';
COMMENT ON COLUMN tutors.whatsapp_consent_given_at IS
  'Timestamp do aceite específico para WhatsApp.';

CREATE INDEX IF NOT EXISTS idx_tutors_whatsapp_consent
  ON tutors (clinic_id, whatsapp_consent)
  WHERE whatsapp_consent = true;

-- =========================================================================
-- 3. Função: registrar acesso a dados (chamada por server actions)
-- =========================================================================

CREATE OR REPLACE FUNCTION rpc_log_data_access(
  p_clinic_id       UUID,
  p_data_subject_id UUID,
  p_data_type       TEXT,
  p_entity_type     TEXT,
  p_entity_id       UUID,
  p_access_type     TEXT  DEFAULT 'read',
  p_purpose         TEXT  DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id       UUID;
  v_caller_clinic UUID;
BEGIN
  SELECT clinic_id INTO v_caller_clinic FROM profiles WHERE id = auth.uid();

  IF v_caller_clinic IS DISTINCT FROM p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido';
  END IF;

  INSERT INTO data_access_logs (
    clinic_id, accessed_by, data_subject_id, data_type,
    entity_type, entity_id, access_type, purpose
  ) VALUES (
    p_clinic_id, auth.uid(), p_data_subject_id, p_data_type,
    p_entity_type, p_entity_id, p_access_type, p_purpose
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_log_data_access IS
  'LGPD: registra acesso a dados pessoais para rastreabilidade. '
  'Chamar em server actions ao acessar prontuários, prescrições e dados sensíveis.';

-- =========================================================================
-- 4. Função: verificar consentimento WhatsApp antes de enviar notificação
-- =========================================================================

CREATE OR REPLACE FUNCTION can_send_whatsapp(
  p_tutor_id  UUID,
  p_clinic_id UUID
)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT whatsapp_consent
     FROM tutors
     WHERE id = p_tutor_id
       AND clinic_id = p_clinic_id),
    false
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION can_send_whatsapp IS
  'LGPD Art. 7, I: retorna true apenas se o tutor consentiu especificamente com WhatsApp. '
  'Chamar antes de enviar qualquer notificação via Z-API.';

-- =========================================================================
-- 5. View: relatório de rastreabilidade por titular (exercício de direito)
-- =========================================================================

CREATE OR REPLACE VIEW data_subject_access_report AS
  SELECT
    dal.clinic_id,
    dal.data_subject_id,
    t.name          AS subject_name,
    dal.data_type,
    dal.entity_type,
    dal.access_type,
    dal.purpose,
    p.full_name     AS accessed_by_name,
    p.role          AS accessed_by_role,
    dal.created_at
  FROM data_access_logs dal
  LEFT JOIN tutors   t ON t.id = dal.data_subject_id
  LEFT JOIN profiles p ON p.id = dal.accessed_by
  ORDER BY dal.created_at DESC;

COMMENT ON VIEW data_subject_access_report IS
  'LGPD Art. 18, I e II: relatório de acesso para exercício do direito de confirmação. '
  'Permite ao DPO responder solicitações de titulares sobre quem acessou seus dados.';

COMMIT;
