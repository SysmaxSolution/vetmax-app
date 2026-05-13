-- ─── 0127: Integração Caixa ↔ Financeiro ────────────────────────────────────
-- Todo lançamento no Caixa gera automaticamente um título no Financeiro.
-- Entradas (central_cashier)  → financial_entries.type = 'receivable'
-- Saídas   (cashier_outflows) → financial_entries.type = 'payable'
-- A relação é um-para-um; o Financeiro referencia o Caixa via FK, não o inverso.

-- 1. Novas colunas em financial_entries
ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS source            TEXT    NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','cashier')),
  ADD COLUMN IF NOT EXISTS cashier_entry_id  UUID    REFERENCES central_cashier(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_outflow_id UUID   REFERENCES cashier_outflows(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_financial_cashier_entry
  ON financial_entries (cashier_entry_id) WHERE cashier_entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_financial_cashier_outflow
  ON financial_entries (cashier_outflow_id) WHERE cashier_outflow_id IS NOT NULL;

-- 2. Trigger: INSERT em central_cashier → cria receivable pago no Financeiro
CREATE OR REPLACE FUNCTION fn_sync_cashier_entry_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;

  INSERT INTO financial_entries (
    clinic_id, type, description, amount,
    due_date, payment_date, status, payment_method,
    source, cashier_entry_id, created_by,
    created_at, updated_at
  ) VALUES (
    NEW.clinic_id,
    'receivable',
    COALESCE(NULLIF(TRIM(NEW.reason), ''), 'Lançamento do Caixa — ' || COALESCE(NEW.source_module, 'manual')),
    NEW.amount,
    NEW.created_at::DATE,
    NEW.created_at::DATE,
    'paid',
    NEW.payment_method,
    'cashier',
    NEW.id,
    NEW.recorded_by,
    NEW.created_at,
    NEW.created_at
  )
  ON CONFLICT (cashier_entry_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashier_entry_to_financial ON central_cashier;
CREATE TRIGGER trg_cashier_entry_to_financial
  AFTER INSERT ON central_cashier
  FOR EACH ROW EXECUTE FUNCTION fn_sync_cashier_entry_to_financial();

-- 3. Trigger: INSERT em cashier_outflows → cria payable pago no Financeiro
CREATE OR REPLACE FUNCTION fn_sync_cashier_outflow_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO financial_entries (
    clinic_id, type, description, amount,
    due_date, payment_date, status,
    source, cashier_outflow_id, created_by,
    created_at, updated_at
  ) VALUES (
    NEW.clinic_id,
    'payable',
    NEW.description,
    NEW.amount,
    NEW.created_at::DATE,
    NEW.created_at::DATE,
    'paid',
    'cashier',
    NEW.id,
    NEW.created_by,
    NEW.created_at,
    NEW.created_at
  )
  ON CONFLICT (cashier_outflow_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashier_outflow_to_financial ON cashier_outflows;
CREATE TRIGGER trg_cashier_outflow_to_financial
  AFTER INSERT ON cashier_outflows
  FOR EACH ROW EXECUTE FUNCTION fn_sync_cashier_outflow_to_financial();

-- 4. Trigger: quando central_cashier é revertido, cancela o título vinculado
CREATE OR REPLACE FUNCTION fn_sync_cashier_reversal_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'reversed' AND OLD.status <> 'reversed' THEN
    UPDATE financial_entries
    SET    status     = 'cancelled',
           updated_at = now()
    WHERE  cashier_entry_id = NEW.id
      AND  status <> 'cancelled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashier_reversal_to_financial ON central_cashier;
CREATE TRIGGER trg_cashier_reversal_to_financial
  AFTER UPDATE ON central_cashier
  FOR EACH ROW EXECUTE FUNCTION fn_sync_cashier_reversal_to_financial();

-- 5. Backfill: lançamentos do Caixa existentes → Financeiro (receivable)
INSERT INTO financial_entries (
  clinic_id, type, description, amount,
  due_date, payment_date, status, payment_method,
  source, cashier_entry_id, created_by,
  created_at, updated_at
)
SELECT
  cc.clinic_id,
  'receivable',
  COALESCE(NULLIF(TRIM(cc.reason), ''), 'Lançamento do Caixa — ' || COALESCE(cc.source_module, 'manual')),
  ABS(cc.amount),
  cc.created_at::DATE,
  cc.created_at::DATE,
  CASE WHEN cc.status = 'reversed' THEN 'cancelled' ELSE 'paid' END,
  cc.payment_method,
  'cashier',
  cc.id,
  cc.recorded_by,
  cc.created_at,
  cc.created_at
FROM central_cashier cc
WHERE cc.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM financial_entries fe WHERE fe.cashier_entry_id = cc.id
  );

-- 6. Backfill: saídas do Caixa existentes → Financeiro (payable)
INSERT INTO financial_entries (
  clinic_id, type, description, amount,
  due_date, payment_date, status,
  source, cashier_outflow_id, created_by,
  created_at, updated_at
)
SELECT
  co.clinic_id,
  'payable',
  co.description,
  co.amount,
  co.created_at::DATE,
  co.created_at::DATE,
  'paid',
  'cashier',
  co.id,
  co.created_by,
  co.created_at,
  co.created_at
FROM cashier_outflows co
WHERE NOT EXISTS (
  SELECT 1 FROM financial_entries fe WHERE fe.cashier_outflow_id = co.id
);
