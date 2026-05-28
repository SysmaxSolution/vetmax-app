-- =============================================================================
-- VetMax — Migration 0198: Estoque por LOTES + baixa FIFO estrita (Regra 1)
--
-- Hoje stock_items guarda batch_number/expiry_date inline (1 lote por item) e a
-- RPC rpc_apply_stock_consumption (0186) decrementa um único registro. Hospital
-- de grande porte exige rastreabilidade por lote + consumo FIFO (primeiro a
-- vencer, primeiro a sair).
--
-- Conteúdo:
--   1. stock_batches — lotes por item (clinic_id, validade, quantidade, lote).
--   2. Backfill: 1 lote por stock_item existente (copia o inline atual).
--   3. CREATE OR REPLACE rpc_apply_stock_consumption — mesma assinatura e mesmas
--      colunas de retorno, mas consome FIFO em cascata com FOR UPDATE; encerra
--      lotes zerados; espelha o somatório em stock_items.quantity. Filosofia
--      "nunca trava": faltou saldo ⇒ o último lote (mais recente) vai negativo +
--      requires_reconciliation. Atomicidade via lock pessimista.
-- =============================================================================

BEGIN;

-- ─── 1. stock_batches ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_batches (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID         NOT NULL REFERENCES clinics(id)     ON DELETE CASCADE,
  stock_item_id UUID         NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  batch_number  TEXT,
  expiry_date   DATE,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 0,
  received_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  supplier      TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Ordem FIFO canônica: vence antes sai antes; NULLs (sem validade) por último.
CREATE INDEX IF NOT EXISTS idx_stock_batches_fifo
  ON stock_batches (stock_item_id, expiry_date ASC NULLS LAST, received_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_stock_batches_clinic
  ON stock_batches (clinic_id);

ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_stock_batches" ON stock_batches;
CREATE POLICY "clinic_isolation_stock_batches"
  ON stock_batches FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE stock_batches IS
  'Lotes de estoque por item (rastreabilidade + FIFO). rpc_apply_stock_consumption consome ordenando por expiry_date ASC NULLS LAST, received_at ASC.';

-- ─── 2. Backfill — 1 lote por item existente (idempotente) ───────────────────
-- Copia o lote inline atual de stock_items. Só insere se o item ainda não tem
-- nenhum lote (re-rodar a migration não duplica).

INSERT INTO stock_batches (clinic_id, stock_item_id, batch_number, expiry_date, quantity, received_at)
SELECT si.clinic_id, si.id, si.batch_number, si.expiry_date, COALESCE(si.quantity, 0), COALESCE(si.created_at, now())
FROM stock_items si
WHERE NOT EXISTS (
  SELECT 1 FROM stock_batches sb WHERE sb.stock_item_id = si.id
);

-- ─── 3. RPC FIFO (CREATE OR REPLACE — mesma assinatura/retorno da 0186) ──────

CREATE OR REPLACE FUNCTION public.rpc_apply_stock_consumption(
  p_clinic_id       UUID,
  p_stock_item_id   UUID,
  p_medication_name TEXT,
  p_quantity        NUMERIC,
  p_source          TEXT,
  p_reference_id    UUID DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL,
  p_user_id         UUID DEFAULT NULL
) RETURNS TABLE (
  movement_id              UUID,
  matched                  BOOLEAN,
  quantity_before          NUMERIC,
  quantity_after           NUMERIC,
  below_minimum            BOOLEAN,
  requires_reconciliation  BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_qty        NUMERIC;
  v_item_min        NUMERIC;
  v_qty_before      NUMERIC;
  v_new_qty         NUMERIC;
  v_remaining       NUMERIC;
  v_take            NUMERIC;
  v_below_min       BOOLEAN := FALSE;
  v_needs_reconcile BOOLEAN := FALSE;
  v_mov_id          UUID;
  v_last_batch_id   UUID;
  v_batch           RECORD;
BEGIN
  ----------------------------------------------------------------------------
  -- Validações (idênticas à 0186)
  ----------------------------------------------------------------------------
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity deve ser positiva (got %)', p_quantity;
  END IF;
  IF p_source NOT IN ('CONSULTATION','HOSPITALIZATION','MANUAL_ADJUSTMENT','INITIAL_STOCK','RESTOCK') THEN
    RAISE EXCEPTION 'source inválido: %', p_source;
  END IF;
  IF p_medication_name IS NULL OR length(trim(p_medication_name)) = 0 THEN
    RAISE EXCEPTION 'medication_name é obrigatório (auditoria)';
  END IF;

  ----------------------------------------------------------------------------
  -- Item não reconhecido: movement audit-only + reconciliação (idêntico à 0186)
  ----------------------------------------------------------------------------
  IF p_stock_item_id IS NULL THEN
    INSERT INTO stock_movements (
      clinic_id, stock_item_id, medication_name, movement_type,
      quantity_change, quantity_before, quantity_after,
      source, reference_id, notes, created_by, requires_reconciliation
    ) VALUES (
      p_clinic_id, NULL, p_medication_name, 'DEBIT',
      -p_quantity, NULL, NULL,
      p_source, p_reference_id,
      COALESCE(p_notes || ' | ', '') || 'unmatched: sem vínculo com stock_item',
      p_user_id, TRUE
    ) RETURNING id INTO v_mov_id;

    RETURN QUERY SELECT v_mov_id, FALSE, NULL::NUMERIC, NULL::NUMERIC, FALSE, TRUE;
    RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- Match OK: lock pessimista no item (espelho) + leitura.
  ----------------------------------------------------------------------------
  SELECT quantity, min_quantity INTO v_item_qty, v_item_min
  FROM stock_items
  WHERE id = p_stock_item_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_item % não encontrado na clínica %', p_stock_item_id, p_clinic_id;
  END IF;

  v_qty_before := COALESCE(v_item_qty, 0);

  -- Garante ao menos 1 lote (itens antigos sem backfill / criados sem lote).
  IF NOT EXISTS (SELECT 1 FROM stock_batches WHERE stock_item_id = p_stock_item_id) THEN
    INSERT INTO stock_batches (clinic_id, stock_item_id, quantity, received_at)
    VALUES (p_clinic_id, p_stock_item_id, v_qty_before, now());
  END IF;

  ----------------------------------------------------------------------------
  -- Debita FIFO em cascata sobre os lotes POSITIVOS (lock pessimista).
  ----------------------------------------------------------------------------
  v_remaining := p_quantity;

  FOR v_batch IN
    SELECT id, quantity
    FROM stock_batches
    WHERE stock_item_id = p_stock_item_id AND quantity > 0
    ORDER BY expiry_date ASC NULLS LAST, received_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_batch.quantity, v_remaining);
    UPDATE stock_batches SET quantity = quantity - v_take WHERE id = v_batch.id;
    v_remaining := v_remaining - v_take;
  END LOOP;

  ----------------------------------------------------------------------------
  -- Faltou saldo: NUNCA trava. O último lote (mais recente) absorve o negativo
  -- para conciliação futura (requires_reconciliation).
  ----------------------------------------------------------------------------
  IF v_remaining > 0 THEN
    SELECT id INTO v_last_batch_id
    FROM stock_batches
    WHERE stock_item_id = p_stock_item_id
    ORDER BY received_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    UPDATE stock_batches SET quantity = quantity - v_remaining WHERE id = v_last_batch_id;
    v_remaining := 0;
  END IF;

  ----------------------------------------------------------------------------
  -- Espelha o somatório dos lotes em stock_items.quantity (fonte da verdade =
  -- soma dos lotes, inclui negativos).
  ----------------------------------------------------------------------------
  SELECT COALESCE(SUM(quantity), 0) INTO v_new_qty
  FROM stock_batches WHERE stock_item_id = p_stock_item_id;

  v_below_min       := v_new_qty <= COALESCE(v_item_min, 0) AND v_new_qty > 0;
  v_needs_reconcile := v_new_qty < 0;

  INSERT INTO stock_movements (
    clinic_id, stock_item_id, medication_name, movement_type,
    quantity_change, quantity_before, quantity_after,
    source, reference_id, notes, created_by, requires_reconciliation
  ) VALUES (
    p_clinic_id, p_stock_item_id, p_medication_name, 'DEBIT',
    -p_quantity, v_qty_before, v_new_qty,
    p_source, p_reference_id, p_notes, p_user_id,
    v_needs_reconcile
  ) RETURNING id INTO v_mov_id;

  UPDATE stock_items
  SET quantity   = v_new_qty,
      updated_at = now()
  WHERE id = p_stock_item_id;

  RETURN QUERY SELECT v_mov_id, TRUE, v_qty_before, v_new_qty, v_below_min, v_needs_reconcile;
END;
$$;

COMMENT ON FUNCTION public.rpc_apply_stock_consumption IS
  'Consumo FIFO por lotes (stock_batches): ordena por expiry_date ASC NULLS LAST, received_at ASC; debita em cascata com FOR UPDATE; espelha somatório em stock_items.quantity. Nunca trava: faltou saldo ⇒ último lote negativo + requires_reconciliation; item não reconhecido ⇒ movement audit-only.';

GRANT EXECUTE ON FUNCTION public.rpc_apply_stock_consumption TO authenticated;

COMMIT;
