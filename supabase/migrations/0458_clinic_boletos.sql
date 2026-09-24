-- 0458 — Boletos emitidos (Cobrança Bancária Sicoob). Persiste cada boleto
-- gerado para consulta/baixa e conciliação futura. Sem policy de RLS: acesso só
-- via service role (server actions).

CREATE TABLE IF NOT EXISTS clinic_boletos (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id        UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  company_id       UUID        REFERENCES companies(id) ON DELETE SET NULL,
  provider         TEXT        NOT NULL DEFAULT 'sicoob',
  environment      TEXT        NOT NULL DEFAULT 'sandbox',
  -- vínculos opcionais com a origem
  consultation_id  UUID        REFERENCES consultations(id) ON DELETE SET NULL,
  financial_entry_id UUID,
  tutor_id         UUID        REFERENCES tutors(id) ON DELETE SET NULL,
  -- dados do boleto
  seu_numero       TEXT        NOT NULL,
  nosso_numero     TEXT,
  valor            NUMERIC(12,2) NOT NULL,
  vencimento       DATE        NOT NULL,
  linha_digitavel  TEXT,
  codigo_barras    TEXT,
  pix_copia_cola   TEXT,
  pdf_path         TEXT,                  -- caminho no bucket (quando armazenado)
  situacao         TEXT        NOT NULL DEFAULT 'emitido'
                     CHECK (situacao IN ('emitido','registrado','pago','baixado','erro')),
  pagador_nome     TEXT,
  pagador_cpf_cnpj TEXT,
  raw_response     JSONB,
  error_message    TEXT,
  created_by       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_boletos_clinic ON clinic_boletos (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_boletos_nosso  ON clinic_boletos (clinic_id, nosso_numero);

ALTER TABLE clinic_boletos ENABLE ROW LEVEL SECURITY;
-- Sem policy: acesso só via service role.

-- Config da cobrança por clínica no bloco JSONB da integração bancária.
-- (numeroCliente, numeroContaCorrente, codigoModalidade, pagador padrão da clínica)
ALTER TABLE clinic_bank_integrations
  ADD COLUMN IF NOT EXISTS cobranca JSONB NOT NULL DEFAULT '{}'::jsonb;
