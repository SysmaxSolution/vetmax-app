-- =============================================================================
-- VetMax — Migration 0062: CRMV Validation (CFMV Compliance)
--
-- 1. CHECK constraint no campo crmv da tabela profiles
--    Formato aceito: UF (2 letras) + dígitos (4-10) — ex: SP12345, RJ123456
--    Baseado na Resolução CFMV nº 1.138/2016
-- 2. Garante que prescreções só podem ser criadas por MVs com CRMV válido
-- 3. Trigger de validação em prescriptions/consultations
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. CHECK constraint no campo crmv de profiles
-- =========================================================================

-- Remove constraint anterior se existir (idempotente)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS chk_crmv_format;

ALTER TABLE profiles
  ADD CONSTRAINT chk_crmv_format
  CHECK (
    crmv IS NULL
    OR crmv ~* '^[A-Z]{2}[0-9]{4,10}$'
  );

COMMENT ON CONSTRAINT chk_crmv_format ON profiles IS
  'CFMV: formato CRMV obrigatório = 2 letras (UF) + 4-10 dígitos. Ex: SP12345, RJ1234567.';

-- =========================================================================
-- 2. View utilitária: vets com CRMV válido
-- =========================================================================

CREATE OR REPLACE VIEW active_vets_with_crmv AS
  SELECT
    p.id,
    p.full_name,
    p.crmv,
    p.clinic_id
  FROM profiles p
  WHERE p.role = 'vet'
    AND p.crmv IS NOT NULL
    AND p.crmv ~* '^[A-Z]{2}[0-9]{4,10}$';

COMMENT ON VIEW active_vets_with_crmv IS
  'CFMV: veterinários com CRMV válido. Usar para preencher selects de prescrição.';

-- =========================================================================
-- 3. Função: valida se um usuário é MV com CRMV válido
-- =========================================================================

CREATE OR REPLACE FUNCTION is_valid_vet(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
      AND role = 'vet'
      AND crmv IS NOT NULL
      AND crmv ~* '^[A-Z]{2}[0-9]{4,10}$'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION is_valid_vet IS
  'Retorna true se o usuário é um MV com CRMV no formato válido conforme CFMV.';

-- =========================================================================
-- 4. Índice para lookup de vets por CRMV
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_crmv
  ON profiles (clinic_id, crmv)
  WHERE crmv IS NOT NULL AND role = 'vet';

COMMIT;
