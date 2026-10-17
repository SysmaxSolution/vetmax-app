-- =============================================================================
-- VetMax — Migration 0505: baixa de medicamentos e insumos aplicados na consulta
-- Clínica Animais · Fase 1 · item 1.7. Issue #64.
--
-- O QUE ESTAVA QUEBRADO
-- ---------------------
-- `applied_medications` guardava só `medication_name` em texto livre, e a baixa
-- era tentada por `deductStockForMedication`, que procurava o item em
-- `pharmacy_stock` — tabela legada que a própria migration 0186 declara vazia —
-- casava por nome exato, baixava sempre 1 unidade e, quando não achava, voltava
-- em silêncio. Pior: inseria em `stock_movements` com `stock_item_id` vindo de
-- `pharmacy_stock`, enquanto a FK dessa coluna aponta para `stock_items` desde a
-- 0186. O erro era engolido por um try/catch. Medido em 17/10/2026: zero linhas
-- de `stock_movements` com `source='CONSULTATION'` no dev e em produção.
--
-- O QUE ESTA MIGRATION FAZ
-- ------------------------
--   1. Amarra a medicação aplicada ao item de estoque (item, quantidade,
--      unidade), ao movimento que a baixou e à linha de cobrança que gerou.
--      O texto livre continua aceito — o Médico Veterinário precisa poder
--      registrar o que aplicou mesmo sem o item cadastrado; nesse caso a baixa
--      vira divergência para conferência, não silêncio.
--   2. Guarda o número da notificação de receita do controlado, que a Portaria
--      344/1998 exige no livro e que hoje não existe em lugar nenhum.
--   3. Cria o rastro de lote por movimento (`stock_movement_batches`). A RPC
--      FIFO debitava os lotes sem registrar QUAIS lotes foram tomados — então
--      não havia como devolver ao lote certo nem dizer qual lote entrou no
--      animal (rastreabilidade de recall). É também a base do item 4.1 (kit
--      cirúrgico com devolução automática do não-usado).
--   4. Cria `rpc_return_stock_consumption`: devolve uma baixa ao estoque, nos
--      lotes exatos de onde saiu, de forma idempotente.
--
-- Aditiva e idempotente. Não altera comportamento de internação nem de cirurgia:
-- a RPC de consumo mantém assinatura, retorno e semântica — só passa a gravar o
-- rastro de lote.
-- =============================================================================

BEGIN;

-- ─── 1. applied_medications: vínculo com o estoque e com a conta ────────────

ALTER TABLE applied_medications
  ADD COLUMN IF NOT EXISTS stock_item_id             UUID REFERENCES stock_items(id)           ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity                  NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS unit                      TEXT,
  ADD COLUMN IF NOT EXISTS stock_movement_id         UUID REFERENCES stock_movements(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_status              TEXT,
  ADD COLUMN IF NOT EXISTS consultation_service_id   UUID REFERENCES consultation_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prescription_notification TEXT,
  ADD COLUMN IF NOT EXISTS returned_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_by               UUID REFERENCES profiles(id)              ON DELETE SET NULL;

ALTER TABLE applied_medications DROP CONSTRAINT IF EXISTS applied_medications_quantity_check;
ALTER TABLE applied_medications ADD  CONSTRAINT applied_medications_quantity_check
  CHECK (quantity IS NULL OR quantity > 0);

-- baixado = saiu do estoque · insuficiente = saiu e o saldo ficou negativo
-- nao_reconhecido = texto livre sem item cadastrado (fica na fila de divergência)
-- sem_baixa = registro clínico sem efeito de estoque (ex.: medicação do tutor)
-- devolvido = a baixa foi revertida (medicação removida do prontuário)
ALTER TABLE applied_medications DROP CONSTRAINT IF EXISTS applied_medications_stock_status_check;
ALTER TABLE applied_medications ADD  CONSTRAINT applied_medications_stock_status_check
  CHECK (stock_status IS NULL OR stock_status IN
    ('baixado', 'insuficiente', 'nao_reconhecido', 'sem_baixa', 'devolvido'));

CREATE INDEX IF NOT EXISTS idx_applied_medications_stock_item
  ON applied_medications (stock_item_id) WHERE stock_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applied_medications_movement
  ON applied_medications (stock_movement_id) WHERE stock_movement_id IS NOT NULL;

COMMENT ON COLUMN applied_medications.stock_item_id IS
  'Item de estoque aplicado. NULL = registro em texto livre (o MV aplicou algo que nao esta cadastrado); a baixa correspondente fica marcada para conferencia.';
COMMENT ON COLUMN applied_medications.quantity IS
  'Quantidade efetivamente aplicada, na unidade do item. NULL em registros antigos, anteriores a esta migration.';
COMMENT ON COLUMN applied_medications.stock_movement_id IS
  'Movimento de estoque gerado pela aplicacao. E por ele que a devolucao sabe de quais lotes repor.';
COMMENT ON COLUMN applied_medications.consultation_service_id IS
  'Linha lancada na conta da OS por esta aplicacao (item 0.7 — captura automatica de faturamento). NULL quando a clinica nao usa cobranca automatica de insumo.';
COMMENT ON COLUMN applied_medications.prescription_notification IS
  'Numero da notificacao de receita do medicamento de controle especial (Portaria 344/1998). Vai ao Livro de Controlados como documento da saida.';

-- ─── 2. reversão de movimento (idempotência da devolução) ───────────────────

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS reversed_movement_id UUID REFERENCES stock_movements(id) ON DELETE SET NULL;

-- Um débito só pode ser devolvido uma vez. O índice único é a trava real —
-- não depende de a aplicação lembrar de conferir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_reversal
  ON stock_movements (reversed_movement_id) WHERE reversed_movement_id IS NOT NULL;

COMMENT ON COLUMN stock_movements.reversed_movement_id IS
  'Quando este movimento e a devolucao de outro, aponta para o movimento de baixa revertido. Indice unico impede devolver a mesma baixa duas vezes.';

-- ─── 3. rastro de lote por movimento ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_movement_batches (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID          NOT NULL REFERENCES clinics(id)         ON DELETE CASCADE,
  movement_id UUID          NOT NULL REFERENCES stock_movements(id) ON DELETE CASCADE,
  batch_id    UUID          NOT NULL REFERENCES stock_batches(id)   ON DELETE CASCADE,
  quantity    NUMERIC(10,3) NOT NULL CHECK (quantity > 0),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movement_batches_movement
  ON stock_movement_batches (movement_id);

CREATE INDEX IF NOT EXISTS idx_stock_movement_batches_batch
  ON stock_movement_batches (batch_id);

CREATE INDEX IF NOT EXISTS idx_stock_movement_batches_clinic
  ON stock_movement_batches (clinic_id, created_at DESC);

ALTER TABLE stock_movement_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_stock_movement_batches" ON stock_movement_batches;
CREATE POLICY "clinic_isolation_stock_movement_batches"
  ON stock_movement_batches FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

REVOKE ALL ON TABLE stock_movement_batches FROM anon;

COMMENT ON TABLE stock_movement_batches IS
  'Quais lotes cada movimento de estoque consumiu, e quanto de cada. Serve a devolucao no lote exato (itens 1.7 e 4.1) e a rastreabilidade sanitaria — saber qual lote foi aplicado em qual animal.';

COMMIT;

-- =============================================================================
-- 4. RPC de consumo: idêntica à definição viva (0198 + search_path fixado),
--    acrescentando apenas o registro do lote tomado.
--
--    O `SET search_path` NÃO é decoração: todas as funções SECURITY DEFINER do
--    banco estão com o pin, e a migration 0500 existe só porque um
--    CREATE OR REPLACE sem a cláusula apagou o pin de uma delas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_apply_stock_consumption(
  p_clinic_id       UUID,
  p_stock_item_id   UUID,
  p_medication_name TEXT,
  p_quantity        NUMERIC,
  p_source          TEXT,
  p_reference_id    UUID DEFAULT NULL::UUID,
  p_notes           TEXT DEFAULT NULL::TEXT,
  p_user_id         UUID DEFAULT NULL::UUID
) RETURNS TABLE (
  movement_id              UUID,
  matched                  BOOLEAN,
  quantity_before          NUMERIC,
  quantity_after           NUMERIC,
  below_minimum            BOOLEAN,
  requires_reconciliation  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
  -- Lotes tomados neste consumo: [{"b": <batch_id>, "q": <qtd>}, ...].
  v_tomados         JSONB := '[]'::JSONB;
BEGIN
  ----------------------------------------------------------------------------
  -- Validações
  ----------------------------------------------------------------------------
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity deve ser positiva (got %)', p_quantity;
  END IF;
  IF p_source NOT IN ('CONSULTATION','HOSPITALIZATION','MANUAL_ADJUSTMENT','INITIAL_STOCK','RESTOCK') THEN
    RAISE EXCEPTION 'source invalido: %', p_source;
  END IF;
  IF p_medication_name IS NULL OR length(trim(p_medication_name)) = 0 THEN
    RAISE EXCEPTION 'medication_name e obrigatorio (auditoria)';
  END IF;

  ----------------------------------------------------------------------------
  -- Item não reconhecido: movement audit-only + reconciliação.
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
      COALESCE(p_notes || ' | ', '') || 'unmatched: sem vinculo com stock_item',
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
    RAISE EXCEPTION 'stock_item % nao encontrado na clinica %', p_stock_item_id, p_clinic_id;
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
    v_tomados := v_tomados || jsonb_build_object('b', v_batch.id, 'q', v_take);
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
    v_tomados := v_tomados || jsonb_build_object('b', v_last_batch_id, 'q', v_remaining);
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

  ----------------------------------------------------------------------------
  -- Rastro de lote (0505): de quais lotes este movimento saiu, e quanto.
  ----------------------------------------------------------------------------
  IF jsonb_array_length(v_tomados) > 0 THEN
    INSERT INTO stock_movement_batches (clinic_id, movement_id, batch_id, quantity)
    SELECT p_clinic_id, v_mov_id, (e->>'b')::UUID, SUM((e->>'q')::NUMERIC)
    FROM jsonb_array_elements(v_tomados) e
    WHERE (e->>'b') IS NOT NULL
    GROUP BY (e->>'b')::UUID
    HAVING SUM((e->>'q')::NUMERIC) > 0;
  END IF;

  UPDATE stock_items
  SET quantity   = v_new_qty,
      updated_at = now()
  WHERE id = p_stock_item_id;

  RETURN QUERY SELECT v_mov_id, TRUE, v_qty_before, v_new_qty, v_below_min, v_needs_reconcile;
END;
$function$;

COMMENT ON FUNCTION public.rpc_apply_stock_consumption IS
  'Consumo FIFO por lotes (stock_batches): ordena por expiry_date ASC NULLS LAST, received_at ASC; debita em cascata com FOR UPDATE; espelha somatorio em stock_items.quantity; grava o rastro de lote em stock_movement_batches. Nunca trava: faltou saldo = ultimo lote negativo + requires_reconciliation; item nao reconhecido = movement audit-only.';

GRANT EXECUTE ON FUNCTION public.rpc_apply_stock_consumption TO authenticated;

-- =============================================================================
-- 5. RPC de devolução: repõe a baixa nos lotes de onde ela saiu.
--
--    Usada quando a medicação é removida do prontuário (1.7) e, adiante, pelo
--    kit cirúrgico que devolve o não-usado (4.1). Idempotente pelo índice único
--    de `reversed_movement_id` — a segunda tentativa falha no banco, não na
--    boa vontade do chamador.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_return_stock_consumption(
  p_clinic_id   UUID,
  p_movement_id UUID,
  p_user_id     UUID DEFAULT NULL::UUID,
  p_notes       TEXT DEFAULT NULL::TEXT
) RETURNS TABLE (
  movement_id     UUID,
  returned        NUMERIC,
  quantity_before NUMERIC,
  quantity_after  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_orig        RECORD;
  v_qtd         NUMERIC;
  v_qty_before  NUMERIC;
  v_new_qty     NUMERIC;
  v_mov_id      UUID;
  v_rastro      INTEGER;
  v_last_batch  UUID;
BEGIN
  SELECT id, clinic_id, stock_item_id, medication_name, movement_type,
         quantity_change, source, reference_id
    INTO v_orig
  FROM stock_movements
  WHERE id = p_movement_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'movimento % nao encontrado na clinica %', p_movement_id, p_clinic_id;
  END IF;
  IF v_orig.movement_type <> 'DEBIT' THEN
    RAISE EXCEPTION 'so uma baixa (DEBIT) pode ser devolvida — movimento % e %', p_movement_id, v_orig.movement_type;
  END IF;
  IF EXISTS (SELECT 1 FROM stock_movements WHERE reversed_movement_id = p_movement_id) THEN
    RAISE EXCEPTION 'movimento % ja foi devolvido', p_movement_id;
  END IF;

  v_qtd := ABS(COALESCE(v_orig.quantity_change, 0));
  IF v_qtd = 0 THEN
    RAISE EXCEPTION 'movimento % nao tem quantidade a devolver', p_movement_id;
  END IF;

  ----------------------------------------------------------------------------
  -- Baixa audit-only (item nunca reconhecido): registra o espelho de crédito e
  -- mantém a divergência visível. Não há lote nem saldo a mexer.
  ----------------------------------------------------------------------------
  IF v_orig.stock_item_id IS NULL THEN
    INSERT INTO stock_movements (
      clinic_id, stock_item_id, medication_name, movement_type,
      quantity_change, quantity_before, quantity_after,
      source, reference_id, notes, created_by, requires_reconciliation,
      reversed_movement_id
    ) VALUES (
      p_clinic_id, NULL, v_orig.medication_name, 'CREDIT',
      v_qtd, NULL, NULL,
      v_orig.source, v_orig.reference_id,
      COALESCE(p_notes, 'Devolucao de aplicacao sem vinculo com item de estoque'),
      p_user_id, TRUE, p_movement_id
    ) RETURNING id INTO v_mov_id;

    RETURN QUERY SELECT v_mov_id, v_qtd, NULL::NUMERIC, NULL::NUMERIC;
    RETURN;
  END IF;

  SELECT quantity INTO v_qty_before
  FROM stock_items
  WHERE id = v_orig.stock_item_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_item % nao encontrado na clinica %', v_orig.stock_item_id, p_clinic_id;
  END IF;

  -- Alias obrigatório: `movement_id` sem qualificação colide com o parâmetro de
  -- saída de mesmo nome da RETURNS TABLE e o Postgres recusa por ambiguidade.
  SELECT COUNT(*) INTO v_rastro
  FROM stock_movement_batches smb WHERE smb.movement_id = p_movement_id;

  IF v_rastro > 0 THEN
    -- Caminho normal: devolve exatamente o que saiu de cada lote.
    UPDATE stock_batches sb
       SET quantity = sb.quantity + smb.quantity
      FROM stock_movement_batches smb
     WHERE smb.movement_id = p_movement_id
       AND sb.id = smb.batch_id;
  ELSE
    -- Movimento anterior ao rastro (ou criado por outro caminho): repõe no lote
    -- mais recente. Documentado de propósito — é aproximação, não precisão.
    SELECT id INTO v_last_batch
    FROM stock_batches
    WHERE stock_item_id = v_orig.stock_item_id
    ORDER BY received_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    IF v_last_batch IS NULL THEN
      INSERT INTO stock_batches (clinic_id, stock_item_id, quantity, received_at)
      VALUES (p_clinic_id, v_orig.stock_item_id, v_qtd, now());
    ELSE
      UPDATE stock_batches SET quantity = quantity + v_qtd WHERE id = v_last_batch;
    END IF;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_new_qty
  FROM stock_batches WHERE stock_item_id = v_orig.stock_item_id;

  INSERT INTO stock_movements (
    clinic_id, stock_item_id, medication_name, movement_type,
    quantity_change, quantity_before, quantity_after,
    source, reference_id, notes, created_by, requires_reconciliation,
    reversed_movement_id
  ) VALUES (
    p_clinic_id, v_orig.stock_item_id, v_orig.medication_name, 'CREDIT',
    v_qtd, v_qty_before, v_new_qty,
    v_orig.source, v_orig.reference_id, p_notes, p_user_id,
    v_new_qty < 0, p_movement_id
  ) RETURNING id INTO v_mov_id;

  UPDATE stock_items
  SET quantity   = v_new_qty,
      updated_at = now()
  WHERE id = v_orig.stock_item_id;

  RETURN QUERY SELECT v_mov_id, v_qtd, v_qty_before, v_new_qty;
END;
$function$;

COMMENT ON FUNCTION public.rpc_return_stock_consumption IS
  'Devolve ao estoque uma baixa ja aplicada, repondo nos lotes exatos registrados em stock_movement_batches (fallback: lote mais recente). Grava movimento CREDIT com reversed_movement_id — o indice unico garante que a mesma baixa nao volte duas vezes.';

GRANT EXECUTE ON FUNCTION public.rpc_return_stock_consumption TO authenticated;
