-- =============================================================================
-- VetMax — Migration 0186: rpc_apply_stock_consumption + flag de reconciliação
-- Épico 2.4 — Baixa Automática de Estoque (voice-to-inventory).
--
-- Princípio (alinhado com PO): "Segurança do paciente > controle de estoque".
-- A baixa NUNCA trava a aplicação clínica. Se o estoque está insuficiente OU
-- o item não foi reconhecido, registra o movement com requires_reconciliation
-- = TRUE para o gerente revisar depois numa tela de "Gestão de Divergências".
--
-- Atomicidade: lock pessimista (SELECT FOR UPDATE) no stock_item evita race
-- condition quando dois veterinários aplicam a mesma ampola simultaneamente.
-- =============================================================================

BEGIN;

-- ─── Afrouxa CHECK de quantity ──────────────────────────────────────────────
-- A regra de negócio aprovada com o PO permite que quantity fique negativa
-- (estoque insuficiente vira reconciliação manual, não trava aplicação
-- clínica). A constraint antiga "quantity >= 0" impede isso. Removida.
-- Mantém-se o controle conceitual via stock_movements.requires_reconciliation.

ALTER TABLE stock_items
  DROP CONSTRAINT IF EXISTS stock_items_quantity_check;

-- ─── Correção de FK legada ──────────────────────────────────────────────────
-- stock_movements.stock_item_id apontava para pharmacy_stock (tabela legada,
-- 0 rows). O app moderno (sales, purchases, patient_custom_prices) usa
-- stock_items. Reaponta a FK — stock_movements também está vazia, então
-- nenhum row órfão a tratar.

ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_stock_item_id_fkey;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_stock_item_id_fkey
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE SET NULL;

-- ─── stock_movements.requires_reconciliation ────────────────────────────────

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS requires_reconciliation BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN stock_movements.requires_reconciliation IS
  'Sinaliza divergência (estoque insuficiente, item não reconhecido). Lista quente do módulo de Gestão de Divergências.';

CREATE INDEX IF NOT EXISTS idx_stock_movements_to_reconcile
  ON stock_movements (clinic_id, created_at DESC)
  WHERE requires_reconciliation = TRUE;

-- ─── RPC transacional ───────────────────────────────────────────────────────

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
  v_new_qty         NUMERIC;
  v_below_min       BOOLEAN := FALSE;
  v_needs_reconcile BOOLEAN := FALSE;
  v_mov_id          UUID;
BEGIN
  ----------------------------------------------------------------------------
  -- Validações
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
  -- Match não encontrado: registra movement audit-only (sem decrementar nada)
  -- e marca para reconciliação manual.
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
  -- Match OK: lock pessimista no item + leitura da quantity atual.
  ----------------------------------------------------------------------------
  SELECT quantity, min_quantity INTO v_item_qty, v_item_min
  FROM stock_items
  WHERE id = p_stock_item_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_item % não encontrado na clínica %', p_stock_item_id, p_clinic_id;
  END IF;

  v_new_qty := v_item_qty - p_quantity;
  -- below_minimum: ficou <= min_quantity mas ainda positivo.
  v_below_min       := v_new_qty <= COALESCE(v_item_min, 0) AND v_new_qty > 0;
  -- requires_reconciliation: ficou negativo (estoque insuficiente).
  v_needs_reconcile := v_new_qty < 0;

  ----------------------------------------------------------------------------
  -- Registro de auditoria com quantity_before / quantity_after preenchidos.
  ----------------------------------------------------------------------------
  INSERT INTO stock_movements (
    clinic_id, stock_item_id, medication_name, movement_type,
    quantity_change, quantity_before, quantity_after,
    source, reference_id, notes, created_by, requires_reconciliation
  ) VALUES (
    p_clinic_id, p_stock_item_id, p_medication_name, 'DEBIT',
    -p_quantity, v_item_qty, v_new_qty,
    p_source, p_reference_id, p_notes, p_user_id,
    v_needs_reconcile
  ) RETURNING id INTO v_mov_id;

  ----------------------------------------------------------------------------
  -- UPDATE quantity. Aplicado MESMO SE ficar negativo (segurança do paciente
  -- > controle de estoque). A divergência fica registrada e a UI alerta.
  ----------------------------------------------------------------------------
  UPDATE stock_items
  SET quantity   = v_new_qty,
      updated_at = now()
  WHERE id = p_stock_item_id;

  RETURN QUERY SELECT v_mov_id, TRUE, v_item_qty, v_new_qty, v_below_min, v_needs_reconcile;
END;
$$;

COMMENT ON FUNCTION public.rpc_apply_stock_consumption IS
  'Consumo atômico de estoque com lock pessimista. Nunca trava: estoque insuficiente / item não encontrado vira movement com requires_reconciliation=TRUE.';

GRANT EXECUTE ON FUNCTION public.rpc_apply_stock_consumption TO authenticated;

COMMIT;
