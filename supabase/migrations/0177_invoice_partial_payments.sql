-- =============================================================================
-- VetMax — Migration 0177: Baixa parcial de invoices com modelo de duplicatas
--
-- Permite que uma invoice receba múltiplas baixas (pagamentos parciais), cada
-- uma representada por um financial_entry filho. O saldo pendente fica num
-- financial_entry separado, atualizado a cada baixa.
--
-- Modelo:
--   invoice (mestre)
--     ├─ financial_entry paid   ← baixa de R$ 30 do tutor
--     ├─ financial_entry pending← saldo de R$ 120 a receber
--     └─ financial_entry pending← Petlove repasse R$ 44,63 (com source=petlove_open)
--
-- Estornar uma baixa: deleta o entry paid, soma o valor de volta no entry
-- pending (ou recria se foi consumido).
--
-- Aditivo — nada destrutivo, dados existentes permanecem em status='paid'
-- com paid_amount=total_amount (assumido total).
-- =============================================================================

BEGIN;

-- ─── 1) Status estendido: paid_partial ─────────────────────────────────────
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('pending', 'paid_partial', 'paid', 'cancelled'));

-- ─── 2) paid_amount acumulado ──────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Backfill: invoices já pagas têm paid_amount = total_amount
UPDATE invoices SET paid_amount = total_amount WHERE status = 'paid' AND paid_amount = 0;

COMMENT ON COLUMN invoices.paid_amount IS
  'Acumulado de pagamentos parciais. Quando = total_amount, status = paid. Quando 0 < x < total, status = paid_partial.';

-- ─── 3) financial_entries.invoice_id (vínculo das duplicatas) ──────────────
ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS invoice_id UUID
    REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_entries_invoice
  ON financial_entries (invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMENT ON COLUMN financial_entries.invoice_id IS
  'Invoice mestre desta duplicata. Vincula entries pendentes/pagos à mesma fatura para permitir baixa parcial e estorno.';

-- ─── 4) is_clinic_discount (ajuste contábil que não é duplicata visível) ───
-- Quando aplicamos cobertura Petlove, o "clinic_discount" entra como entry
-- desse tipo: aparece na contabilidade mas não conta como saldo a receber.
ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS is_clinic_discount BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN financial_entries.is_clinic_discount IS
  'Quando true, este entry representa um desconto contábil (convênio) — não conta como saldo a receber, mas explica a diferença entre total_amount da invoice e a soma das outras duplicatas.';

COMMIT;
