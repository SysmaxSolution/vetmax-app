-- 0457 — Autenticidade de laudo por QR + hash + assinatura do MV.
-- Base para ICP-Brasil (a assinatura criptográfica real com certificado A1/A3
-- é um 2º passo). Aqui: hash SHA-256 do PDF final, código público de verificação
-- e identidade de quem liberou (nome + CRMV), com página pública /public/verificar.

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS content_hash TEXT,                 -- SHA-256 (hex) do PDF assinado
  ADD COLUMN IF NOT EXISTS verify_code  TEXT,                 -- código público curto (URL do QR)
  ADD COLUMN IF NOT EXISTS signed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signer_name  TEXT,
  ADD COLUMN IF NOT EXISTS signer_crmv  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_documents_verify_code
  ON patient_documents (verify_code) WHERE verify_code IS NOT NULL;
