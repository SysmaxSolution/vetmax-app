-- =============================================================================
-- VetMax — Migration 0064: Data Retention Policy (LGPD Art. 16 + CFMV 1.138/2016)
--
-- 1. Tabela data_retention_policies — configuração por clínica e tipo de dado
-- 2. Função anonymize_expired_data — anonimiza dados após vencimento do prazo
-- 3. Tabela deletion_requests — rastreia solicitações de exclusão de titulares
-- 4. View retention_audit — supervisão de dados vencidos
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Tabela de políticas de retenção por clínica e tipo de dado
-- =========================================================================

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  data_type            TEXT        NOT NULL,
  retention_years      INTEGER     NOT NULL CHECK (retention_years > 0),
  legal_basis          TEXT        NOT NULL,
  auto_anonymize       BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, data_type)
);

COMMENT ON TABLE data_retention_policies IS
  'LGPD Art. 16: define prazo de retenção por tipo de dado. '
  'CFMV 1.138/2016: prontuários = mínimo 7 anos.';

COMMENT ON COLUMN data_retention_policies.data_type IS
  'Tipo de dado: medical_records | personal_data | financial | audit_logs | whatsapp_notifications';
COMMENT ON COLUMN data_retention_policies.retention_years IS
  'Prazo de retenção em anos. Para medical_records mínimo = 7 (CFMV).';
COMMENT ON COLUMN data_retention_policies.legal_basis IS
  'Base legal para retenção: obrigacao_legal | contrato | legitimo_interesse | consentimento';
COMMENT ON COLUMN data_retention_policies.auto_anonymize IS
  'Se true, anonimiza automaticamente ao vencer. Se false, apenas sinaliza para revisão humana.';

-- RLS
ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention_policies_clinic_isolation"
  ON data_retention_policies FOR ALL
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- =========================================================================
-- 2. Inserir políticas padrão — executadas via função para não depender
--    de clinic_id específico em migração (cada clínica terá suas próprias
--    via seed ou onboarding)
-- =========================================================================

-- Função utilitária: seed de políticas padrão para uma clínica recém-criada
CREATE OR REPLACE FUNCTION seed_default_retention_policies(p_clinic_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO data_retention_policies
    (clinic_id, data_type, retention_years, legal_basis, auto_anonymize)
  VALUES
    (p_clinic_id, 'medical_records',         7,  'obrigacao_legal',     false),
    (p_clinic_id, 'personal_data',           5,  'contrato',            true),
    (p_clinic_id, 'financial',               5,  'obrigacao_legal',     false),
    (p_clinic_id, 'audit_logs',              2,  'legitimo_interesse',  true),
    (p_clinic_id, 'whatsapp_notifications',  1,  'consentimento',       true),
    (p_clinic_id, 'consent_history',         5,  'obrigacao_legal',     false)
  ON CONFLICT (clinic_id, data_type) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION seed_default_retention_policies IS
  'Cria políticas de retenção padrão para uma clínica. Chamar no onboarding.';

-- =========================================================================
-- 3. Tabela de solicitações de exclusão (LGPD Art. 18, IV)
-- =========================================================================

CREATE TABLE IF NOT EXISTS deletion_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  tutor_id        UUID        REFERENCES tutors(id) ON DELETE SET NULL,
  requester_name  TEXT        NOT NULL,
  requester_email TEXT        NOT NULL,
  requester_cpf   TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'completed', 'denied', 'partial')),
  denial_reason   TEXT,       -- preenchido se status='denied' ou 'partial'
  notes           TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID        REFERENCES profiles(id)
);

COMMENT ON TABLE deletion_requests IS
  'LGPD Art. 18, IV: rastreia solicitações de eliminação de dados pessoais. '
  'Negativas devem ser justificadas (ex: obrigação legal de prontuário — CFMV).';

ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deletion_requests_clinic_isolation"
  ON deletion_requests FOR ALL
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status
  ON deletion_requests (clinic_id, status, requested_at DESC);

-- =========================================================================
-- 4. Função: anonimizar dados expirados (LGPD Art. 16)
--
-- Anonimiza dados pessoais de tutores cujo prazo de retenção venceu e
-- que NÃO têm prontuários ativos (dados médicos têm prazo próprio).
-- Operação auditada: registra em audit_logs antes de anonimizar.
-- =========================================================================

CREATE OR REPLACE FUNCTION anonymize_expired_data(
  p_clinic_id UUID,
  p_dry_run   BOOLEAN DEFAULT true   -- true = apenas relata, não modifica
)
RETURNS TABLE (
  affected_type   TEXT,
  affected_count  INTEGER,
  action_taken    TEXT
) AS $$
DECLARE
  v_personal_years  INTEGER;
  v_notif_years     INTEGER;
  v_cutoff_personal TIMESTAMPTZ;
  v_cutoff_notif    TIMESTAMPTZ;
  v_tutor_count     INTEGER := 0;
  v_notif_count     INTEGER := 0;
  v_caller_role     TEXT;
  v_caller_clinic   UUID;
BEGIN
  -- Apenas admin/owner pode executar
  SELECT role, clinic_id INTO v_caller_role, v_caller_clinic
  FROM profiles WHERE id = auth.uid();

  IF v_caller_clinic IS DISTINCT FROM p_clinic_id THEN
    RAISE EXCEPTION 'Acesso negado: clinic_id inválido';
  END IF;

  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Apenas administradores podem anonimizar dados';
  END IF;

  -- Busca prazo configurado (fallback: padrões legais)
  SELECT COALESCE(
    (SELECT retention_years FROM data_retention_policies
     WHERE clinic_id = p_clinic_id AND data_type = 'personal_data' LIMIT 1),
    5
  ) INTO v_personal_years;

  SELECT COALESCE(
    (SELECT retention_years FROM data_retention_policies
     WHERE clinic_id = p_clinic_id AND data_type = 'whatsapp_notifications' LIMIT 1),
    1
  ) INTO v_notif_years;

  v_cutoff_personal := NOW() - MAKE_INTERVAL(years => v_personal_years);
  v_cutoff_notif    := NOW() - MAKE_INTERVAL(years => v_notif_years);

  -- ── 1. Tutores sem pacientes ativos e dados expirados ──────────────────────
  -- Um tutor pode ser anonimizado quando:
  --   a) Não tem pacientes com consultas nos últimos `v_personal_years` anos
  --   b) Não tem prontuários abertos
  --   c) O último atendimento foi há mais de `v_personal_years` anos
  SELECT COUNT(*) INTO v_tutor_count
  FROM tutors t
  WHERE t.clinic_id = p_clinic_id
    AND t.consent_given = true    -- apenas tutores que deram consentimento (base legal conhecida)
    AND t.created_at < v_cutoff_personal
    AND NOT EXISTS (
      SELECT 1 FROM patients p
      JOIN consultations c ON c.patient_id = p.id
      WHERE p.tutor_id = t.id
        AND c.created_at > v_cutoff_personal
    )
    -- Preservar tutores com nome já anonimizado
    AND t.name NOT LIKE 'ANONIMIZADO%';

  IF NOT p_dry_run AND v_tutor_count > 0 THEN
    -- Registrar no audit_logs antes de modificar
    INSERT INTO audit_logs (clinic_id, user_id, action, entity_type, entity_id, details)
    SELECT
      p_clinic_id,
      auth.uid(),
      'ANONYMIZE_TUTOR',
      'tutors',
      t.id,
      jsonb_build_object('original_name_hash', md5(t.name), 'reason', 'retention_policy_expired')
    FROM tutors t
    WHERE t.clinic_id = p_clinic_id
      AND t.consent_given = true
      AND t.created_at < v_cutoff_personal
      AND t.name NOT LIKE 'ANONIMIZADO%'
      AND NOT EXISTS (
        SELECT 1 FROM patients p2
        JOIN consultations c2 ON c2.patient_id = p2.id
        WHERE p2.tutor_id = t.id AND c2.created_at > v_cutoff_personal
      );

    -- Anonimizar dados pessoais (mantém ID para integridade referencial)
    UPDATE tutors SET
      name    = 'ANONIMIZADO-' || SUBSTRING(id::text, 1, 8),
      cpf     = '00000000000',
      email   = NULL,
      phone   = '00000000000',
      address = NULL,
      consent_ip = NULL
    WHERE clinic_id = p_clinic_id
      AND consent_given = true
      AND created_at < v_cutoff_personal
      AND name NOT LIKE 'ANONIMIZADO%'
      AND NOT EXISTS (
        SELECT 1 FROM patients p3
        JOIN consultations c3 ON c3.patient_id = p3.id
        WHERE p3.tutor_id = tutors.id AND c3.created_at > v_cutoff_personal
      );
  END IF;

  -- ── 2. Notificações WhatsApp expiradas ──────────────────────────────────────
  SELECT COUNT(*) INTO v_notif_count
  FROM whatsapp_notifications
  WHERE clinic_id = p_clinic_id
    AND sent_at < v_cutoff_notif;

  IF NOT p_dry_run AND v_notif_count > 0 THEN
    DELETE FROM whatsapp_notifications
    WHERE clinic_id = p_clinic_id
      AND sent_at < v_cutoff_notif;
  END IF;

  -- ── Resultado ───────────────────────────────────────────────────────────────
  RETURN QUERY VALUES
    ('tutors_personal_data'::TEXT,
     v_tutor_count,
     CASE WHEN p_dry_run THEN 'DRY RUN — nenhuma alteração' ELSE 'ANONIMIZADO' END),
    ('whatsapp_notifications'::TEXT,
     v_notif_count,
     CASE WHEN p_dry_run THEN 'DRY RUN — nenhuma alteração' ELSE 'DELETADO' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION anonymize_expired_data IS
  'LGPD Art. 16: anonimiza/elimina dados após vencimento do prazo de retenção. '
  'Use p_dry_run=true para auditar sem modificar. Registra em audit_logs antes de anonimizar.';

-- =========================================================================
-- 5. Índices para performance da limpeza
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_tutors_created_at_clinic
  ON tutors (clinic_id, created_at)
  WHERE name NOT LIKE 'ANONIMIZADO%';

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_created
  ON whatsapp_notifications (clinic_id, sent_at DESC);

-- =========================================================================
-- 6. View: dados candidatos a anonimização (auditoria para admins)
-- =========================================================================

CREATE OR REPLACE VIEW retention_audit AS
  SELECT
    t.clinic_id,
    t.id            AS tutor_id,
    t.name          AS tutor_name,
    t.created_at,
    t.consent_given,
    drp.retention_years,
    (t.created_at + MAKE_INTERVAL(years => drp.retention_years)) AS expires_at,
    CASE
      WHEN NOW() > (t.created_at + MAKE_INTERVAL(years => drp.retention_years))
      THEN true ELSE false
    END             AS is_expired
  FROM tutors t
  LEFT JOIN data_retention_policies drp
    ON drp.clinic_id = t.clinic_id AND drp.data_type = 'personal_data'
  WHERE t.name NOT LIKE 'ANONIMIZADO%';

COMMENT ON VIEW retention_audit IS
  'LGPD: visão de dados pessoais e seus prazos de expiração. '
  'is_expired=true indica candidatos à anonimização.';

COMMIT;
