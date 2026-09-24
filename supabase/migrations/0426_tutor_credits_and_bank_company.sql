-- 0426: Adiantamento/crédito do tutor + vínculo de conta bancária à empresa (Fase 1).
-- (a) bank_accounts.company_id: cada conta bancária pertence a uma empresa (CNPJ)
--     do grupo → base da conciliação bancária por CNPJ (1.3) e visão cruzada (1.4).
-- (b) tutor_credits: RAZÃO de crédito/adiantamento do tutor (partida por movimento).
--     Saldo = SUM(amount) por tutor (e por empresa). + = entrada (adiantamento /
--     transferência recebida); - = uso / transferência enviada / devolução.
-- Aditiva. RLS sem policy pública (service role).

-- (a) conta bancária ↔ empresa faturante
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- (b) razão de crédito do tutor
CREATE TABLE IF NOT EXISTS tutor_credits (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id        UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  tutor_id         UUID        NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  company_id       UUID        REFERENCES companies(id) ON DELETE SET NULL, -- empresa onde o crédito existe (NULL = geral/sem multi-CNPJ)
  amount           NUMERIC(12,2) NOT NULL,   -- + entrada / - saída
  kind             TEXT        NOT NULL CHECK (kind IN ('advance','usage','transfer_in','transfer_out','refund','adjustment')),
  reference        TEXT,                      -- descrição legível (ex.: "Adiantamento", "Uso na venda REC-2026-000123")
  cashier_entry_id UUID,                      -- link ao central_cashier quando gerou/baixou caixa
  invoice_id       UUID,                      -- link à venda quando o crédito foi usado
  created_by       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tutor_credits_tutor   ON tutor_credits (clinic_id, tutor_id);
CREATE INDEX IF NOT EXISTS idx_tutor_credits_company ON tutor_credits (company_id) WHERE company_id IS NOT NULL;
ALTER TABLE tutor_credits ENABLE ROW LEVEL SECURITY;
