-- 0462 — Reforma do módulo de boletos.
-- (a) Config de emissão POR CONTA bancária (aba "Carteira Bancária").
-- (b) Nosso número sequencial (autoincremento) por conta, com RPC atômica.
-- (c) Campos de vínculo/envio/link público em clinic_boletos.

-- (a) Config da carteira de cobrança na conta bancária (JSONB flexível).
--     Ex.: { agencia, conta, conta_dv, carteira, modalidade, codigo_cliente,
--            multa_percent, juros_mes_percent, instrucao_codigo, mensagens[],
--            especie, beneficiario_nome, beneficiario_doc, beneficiario_endereco,
--            environment }
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS boleto_config     JSONB  NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS boleto_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS next_nosso_numero BIGINT NOT NULL DEFAULT 1;

-- (b) Emissão atômica do próximo nosso número da conta.
CREATE OR REPLACE FUNCTION next_nosso_numero(p_bank_account_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_num BIGINT;
BEGIN
  UPDATE bank_accounts
     SET next_nosso_numero = next_nosso_numero + 1
   WHERE id = p_bank_account_id
   RETURNING next_nosso_numero - 1 INTO v_num;
  IF v_num IS NULL THEN RAISE EXCEPTION 'Conta bancária não encontrada (%).', p_bank_account_id; END IF;
  RETURN v_num;
END;
$$;

-- (c) Campos novos em clinic_boletos.
ALTER TABLE clinic_boletos
  ADD COLUMN IF NOT EXISTS bank_account_id  UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_clinic_id UUID,
  ADD COLUMN IF NOT EXISTS nosso_numero_dv  TEXT,
  ADD COLUMN IF NOT EXISTS public_token     TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_boletos_public_token
  ON clinic_boletos (public_token) WHERE public_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinic_boletos_entry
  ON clinic_boletos (clinic_id, financial_entry_id);
