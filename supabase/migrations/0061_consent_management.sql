-- =============================================================================
-- VetMax — Migration 0061: Consent Management (LGPD Compliance)
--
-- 1. Adiciona coluna consent_given, consent_given_at, consent_ip à tabela tutors
-- 2. Cria tabela consent_history para auditoria de consentimentos
-- 3. RLS policies para consent_history
-- 4. Índices para lookup eficiente
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Colunas de consentimento na tabela tutors
-- =========================================================================

ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS consent_given     BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_given_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_ip        INET,
  ADD COLUMN IF NOT EXISTS consent_version   TEXT      DEFAULT '1.0';

COMMENT ON COLUMN tutors.consent_given    IS 'LGPD: tutor aceitou os termos de privacidade';
COMMENT ON COLUMN tutors.consent_given_at IS 'LGPD: timestamp do aceite';
COMMENT ON COLUMN tutors.consent_ip       IS 'LGPD: IP do dispositivo no momento do aceite (para prova)';
COMMENT ON COLUMN tutors.consent_version  IS 'LGPD: versão da política de privacidade aceita';

-- =========================================================================
-- 2. Tabela de histórico de consentimentos (auditoria imutável)
-- =========================================================================

CREATE TABLE IF NOT EXISTS consent_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  tutor_id       UUID        NOT NULL REFERENCES tutors(id)  ON DELETE CASCADE,
  action         TEXT        NOT NULL CHECK (action IN ('granted', 'revoked', 'updated')),
  consent_version TEXT       NOT NULL DEFAULT '1.0',
  consent_text   TEXT,           -- snapshot do texto aceito
  ip_address     INET,
  user_agent     TEXT,
  recorded_by    UUID        REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE consent_history IS
  'LGPD Art. 7 e 8: histórico imutável de consentimentos do tutor. Retenção mínima: 7 anos (CFMV Res. 1.138/2016).';

-- =========================================================================
-- 3. RLS para consent_history
-- =========================================================================

ALTER TABLE consent_history ENABLE ROW LEVEL SECURITY;

-- Admin/owner/manager/receptionist da própria clínica podem ler
CREATE POLICY "consent_history_select"
  ON consent_history FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN
        ('admin', 'owner', 'manager', 'receptionist', 'vet')
  );

-- Apenas admin/owner/manager/receptionist da própria clínica podem inserir
CREATE POLICY "consent_history_insert"
  ON consent_history FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN
        ('admin', 'owner', 'manager', 'receptionist')
  );

-- Ninguém pode UPDATE ou DELETE (auditoria imutável)
-- Sem políticas para UPDATE/DELETE = bloqueado por padrão com RLS ativo

-- =========================================================================
-- 4. Índices
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_consent_history_tutor
  ON consent_history (tutor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_history_clinic
  ON consent_history (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tutors_consent_given
  ON tutors (clinic_id, consent_given)
  WHERE consent_given = false;  -- índice parcial para auditoria de tutores sem consentimento

-- =========================================================================
-- 5. Função: registra consentimento e atualiza tutor atomicamente
-- =========================================================================

CREATE OR REPLACE FUNCTION rpc_record_consent(
  p_tutor_id       UUID,
  p_clinic_id      UUID,
  p_action         TEXT,           -- 'granted' | 'revoked' | 'updated'
  p_ip_address     INET    DEFAULT NULL,
  p_user_agent     TEXT    DEFAULT NULL,
  p_consent_version TEXT   DEFAULT '1.0',
  p_consent_text   TEXT    DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_history_id UUID;
  v_caller_clinic UUID;
BEGIN
  -- Valida que o usuário autenticado pertence à mesma clínica
  SELECT clinic_id INTO v_caller_clinic FROM profiles WHERE id = auth.uid();
  IF v_caller_clinic IS DISTINCT FROM p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido';
  END IF;

  -- Atualiza o tutor
  UPDATE tutors SET
    consent_given    = (p_action = 'granted'),
    consent_given_at = CASE WHEN p_action = 'granted' THEN NOW() ELSE consent_given_at END,
    consent_ip       = p_ip_address,
    consent_version  = p_consent_version
  WHERE id = p_tutor_id AND clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutor não encontrado: %', p_tutor_id;
  END IF;

  -- Insere no histórico
  INSERT INTO consent_history (
    clinic_id, tutor_id, action, consent_version,
    consent_text, ip_address, user_agent, recorded_by
  ) VALUES (
    p_clinic_id, p_tutor_id, p_action, p_consent_version,
    p_consent_text, p_ip_address, p_user_agent, auth.uid()
  ) RETURNING id INTO v_history_id;

  RETURN jsonb_build_object(
    'success', true,
    'history_id', v_history_id,
    'action', p_action
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_record_consent IS
  'LGPD: registra consentimento do tutor atomicamente. Atualiza tutors e insere em consent_history.';

COMMIT;
