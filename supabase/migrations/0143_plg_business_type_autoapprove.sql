-- PLG Sprint 1 — Auto-aprovação e tipo de negócio
-- Remove fricção de entrada: novas clínicas nascem com status 'active' no plano Free.

-- 1. Tipo de negócio do tenant
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'vet_clinic'
  CHECK (business_type IN ('vet_clinic', 'pet_aesthetics'));

COMMENT ON COLUMN clinics.business_type IS
  'Segmento operacional do tenant: vet_clinic (clínica veterinária) ou pet_aesthetics (banho/tosa).';

-- 2. Muda default de status: novas clínicas nascem ativas (PLG auto-approve)
ALTER TABLE clinics
  ALTER COLUMN status SET DEFAULT 'active';

-- 3. Ativa clínicas aguardando aprovação manual.
-- Seguro no estado atual do produto: 'pending' é usado exclusivamente para
-- novos cadastros aguardando liberação SysMax. Não existe mecanismo de bloqueio
-- por fraude/inadimplência ainda — quando implementado, usar status 'suspended'.
UPDATE clinics
  SET status = 'active'
  WHERE status = 'pending';

-- 4. Persiste business_type no fluxo de e-mail confirmation (pendentes até callback)
ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'vet_clinic'
  CHECK (business_type IN ('vet_clinic', 'pet_aesthetics'));
