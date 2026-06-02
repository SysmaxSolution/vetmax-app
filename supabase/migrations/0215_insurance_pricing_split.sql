-- =============================================================================
-- VetMax — Migration 0215: split coparticipação/repasse no modelo de preços
--
-- Contexto (decisão PO 2026-06-02):
--   Quando o pet tem convênio Petlove, o preço cobrado se divide em:
--     - Coparticipação (tutor paga no balcão)
--     - Repasse (clínica fatura contra Petlove)
--   Regra de Ouro: total = coparticipação + repasse
--
-- Esta migration:
--   1. Adiciona stock_items.default_insurance_price (preço base de convênio
--      por serviço — editável no cadastro, com botão "sugerir do histórico").
--   2. Estende patient_custom_prices com copay_amount e repass_amount.
--      A coluna existente custom_price continua representando o TOTAL e ganha
--      uma constraint de coerência: quando copay E repass estiverem preenchidos,
--      total ≈ copay + repass (tolerância 1 cent).
--   3. Estende consultation_services com snapshots de split (insurance_total,
--      copay, repass) para preservar o que foi acordado no atendimento, sem
--      mudar o price_snapshot existente (regra: snapshot é imutável).
--   4. Backfill conservador para linhas já vindas de remessa Petlove:
--      copay=0, repass=custom_price (era o que o histórico observava).
--
-- Aditiva, idempotente, sem migração de tipo. Reversível baixando as colunas.
-- =============================================================================

BEGIN;

-- ─── 1. stock_items.default_insurance_price ──────────────────────────────────

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS default_insurance_price NUMERIC(10,2)
    CHECK (default_insurance_price IS NULL OR default_insurance_price >= 0);

COMMENT ON COLUMN stock_items.default_insurance_price IS
  'Preço base quando o serviço é cobrado via convênio. NULL = sem default cadastrado (cai no fallback particular ou exige split manual no consultório). Editável em Cadastros > Serviços com botão "sugerir" baseado em patient_custom_prices.';

-- ─── 2. patient_custom_prices: split copay + repass ──────────────────────────

ALTER TABLE patient_custom_prices
  ADD COLUMN IF NOT EXISTS copay_amount  NUMERIC(10,2)
    CHECK (copay_amount IS NULL OR copay_amount >= 0),
  ADD COLUMN IF NOT EXISTS repass_amount NUMERIC(10,2)
    CHECK (repass_amount IS NULL OR repass_amount >= 0);

COMMENT ON COLUMN patient_custom_prices.copay_amount IS
  'Coparticipação do tutor. Quando preenchido junto com repass_amount, deve satisfazer copay + repass ≈ custom_price.';
COMMENT ON COLUMN patient_custom_prices.repass_amount IS
  'Repasse do plano (Petlove). Mesma regra de coerência com copay_amount + custom_price.';

-- Constraint de coerência: tolerância 1 cent para erros de arredondamento de NUMERIC(10,2)
ALTER TABLE patient_custom_prices
  DROP CONSTRAINT IF EXISTS patient_custom_prices_split_coherent;
ALTER TABLE patient_custom_prices
  ADD CONSTRAINT patient_custom_prices_split_coherent
  CHECK (
    copay_amount IS NULL OR repass_amount IS NULL
    OR ABS((copay_amount + repass_amount) - custom_price) < 0.01
  );

-- ─── 3. consultation_services: snapshots de split ────────────────────────────
-- Quando o vet ajusta copay/repass no consultório, a versão "desta consulta"
-- fica imutável aqui (snapshot), e a versão "para futuras consultas" vai pra
-- patient_custom_prices via UPSERT.

ALTER TABLE consultation_services
  ADD COLUMN IF NOT EXISTS insurance_total_snapshot NUMERIC(10,2)
    CHECK (insurance_total_snapshot IS NULL OR insurance_total_snapshot >= 0),
  ADD COLUMN IF NOT EXISTS copay_snapshot           NUMERIC(10,2)
    CHECK (copay_snapshot IS NULL OR copay_snapshot >= 0),
  ADD COLUMN IF NOT EXISTS repass_snapshot          NUMERIC(10,2)
    CHECK (repass_snapshot IS NULL OR repass_snapshot >= 0);

COMMENT ON COLUMN consultation_services.insurance_total_snapshot IS
  'Total convênio acordado nesta consulta. NULL = pet sem convênio ou serviço particular. Snapshot — não atualiza quando preço base muda.';
COMMENT ON COLUMN consultation_services.copay_snapshot IS
  'Coparticipação acordada nesta consulta. Vai virar invoice_items.coparticipation_value no billing.';
COMMENT ON COLUMN consultation_services.repass_snapshot IS
  'Repasse acordado nesta consulta. Vai compor o lançamento de receber Petlove no financial_entries.';

-- ─── 4. Backfill conservador para remessas Petlove existentes ────────────────
-- Linhas com source='petlove_remittance' têm custom_price = repass_value
-- observado da planilha (a clínica anotou o repasse do plano). Marcamos
-- copay=0 e repass=custom_price; operador edita depois se for o caso.
-- Linhas 'manual' ou 'other_insurance' ficam NULL → forçam preenchimento.

UPDATE patient_custom_prices
   SET repass_amount = custom_price,
       copay_amount  = 0
 WHERE source        = 'petlove_remittance'
   AND copay_amount  IS NULL
   AND repass_amount IS NULL;

-- ─── 5. Índice para lookup rápido no checkout ────────────────────────────────
-- Hot path: resolveServicePricing(patient, item) → 1 row por chave única já
-- coberta pelo UNIQUE existente. Este índice parcial acelera filtros de "tem
-- split definido" em telas de listagem da aba "Convênio" do pet.

CREATE INDEX IF NOT EXISTS idx_patient_custom_prices_with_split
  ON patient_custom_prices (clinic_id, patient_id)
  WHERE copay_amount IS NOT NULL AND repass_amount IS NOT NULL;

COMMIT;
