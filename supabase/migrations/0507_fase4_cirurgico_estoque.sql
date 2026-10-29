-- =============================================================================
-- VetMax — Migration 0507: Fase 4 — Centro Cirúrgico + Estoque
-- Clínica Animais · itens 4.1, 4.2, 4.3 e 4.4.
--
-- O QUE JÁ EXISTE E NÃO SE TOCA
-- -----------------------------
-- Fluxo Preparo→Sala→RPA→Pós-op, checklist pré-operatório no JSONB, ficha
-- anestésica com vitais, relatório cirúrgico, anotações por etapa, kit
-- cadastrável (`service_kits` + `service_kit_items`), cobrança na conta da
-- cirurgia (`surgery_charges`) e estoque com lotes/validade/FIFO
-- (`stock_batches` + `rpc_apply_stock_consumption`). A 0505 acrescentou o rastro
-- de qual lote cada movimento consumiu e a devolução no lote exato — é a
-- fundação do item 4.1 e por isso esta migration vem depois dela.
--
-- O DELTA DA FASE 4
-- -----------------
--   4.1 devolução do não-usado ao estoque. Hoje `applyKitToSurgery` consome o
--       kit inteiro e lança UM valor total na conta; não guarda o que saiu item
--       a item nem qual movimento baixou cada insumo, então não há como devolver
--       nada. É o vazamento de dinheiro que o Vinícius aponta como nº 1.
--   4.2 gate do pré-anestésico: hoje o checklist existe mas não impede nada.
--   4.3 mapa das cirurgias do dia: falta a hora prevista e a duração.
--   4.4 endereçamento de prateleira, sugestão de compra pela saída e alerta de
--       validade como rotina. Nenhum `shelf`/`location` existe em migration
--       nenhuma.
--
-- O QUE FICOU DE FORA E POR QUÊ
-- -----------------------------
-- As 24 perguntas de desenho enviadas ao Vinícius em 10/10 seguem sem resposta.
-- Esta migration entrega o que é inequívoco e deixa configurável tudo o que a
-- resposta dele mudaria — por isso o gate do pré-anestésico é flag por item e
-- não regra fixa, e por isso o saldo continua único com indicação de onde
-- encontrar (pergunta 18 em aberto: saldo POR local exigiria mudar a conta do
-- estoque inteiro, o que não se faz sem a resposta).
--
-- Aditiva e idempotente.
-- =============================================================================

BEGIN;

-- ─── 4.1 · o que não pode voltar ao estoque ─────────────────────────────────
--
-- Frasco aberto, seringa aspirada, campo desembalado: saiu, não volta. Isso é
-- PERDA, não devolução, e a diferença importa — perda aparece no estoque como
-- perda e no Livro de Controlados como perda. Default TRUE (volta), porque é o
-- caso da maioria; a clínica marca os que não voltam.

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS returnable BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN stock_items.returnable IS
  'FALSE = depois de aberto nao volta ao estoque (frasco aberto, seringa aspirada, campo desembalado). Na conferencia do kit o item vira perda em vez de devolucao.';

-- ─── 4.1 · aplicação do kit, item a item ────────────────────────────────────

CREATE TABLE IF NOT EXISTS surgery_kit_applications (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID         NOT NULL REFERENCES clinics(id)       ON DELETE CASCADE,
  surgery_id      UUID         NOT NULL REFERENCES surgeries(id)     ON DELETE CASCADE,
  kit_id          UUID         REFERENCES service_kits(id)           ON DELETE SET NULL,
  -- Snapshot do nome: o kit pode ser renomeado ou desativado depois, e a ficha
  -- da cirurgia tem de continuar dizendo o que foi aplicado naquele dia.
  kit_name        TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'aplicado'
                                 CHECK (status IN ('aplicado', 'conferido', 'cancelado')),
  applied_by      UUID         REFERENCES profiles(id)               ON DELETE SET NULL,
  applied_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Quem conferiu a devolução no fim da cirurgia, e quando. Pergunta 3 ao
  -- Vinícius é QUEM confere; seja quem for, fica registrado.
  reconciled_by   UUID         REFERENCES profiles(id)               ON DELETE SET NULL,
  reconciled_at   TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surgery_kit_applications_surgery
  ON surgery_kit_applications (surgery_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_surgery_kit_applications_clinic
  ON surgery_kit_applications (clinic_id, applied_at DESC);
-- Fila de conferência pendente: o que saiu e ninguém devolveu ainda.
CREATE INDEX IF NOT EXISTS idx_surgery_kit_applications_pendentes
  ON surgery_kit_applications (clinic_id, applied_at DESC)
  WHERE status = 'aplicado';

ALTER TABLE surgery_kit_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_surgery_kit_applications" ON surgery_kit_applications;
CREATE POLICY "clinic_isolation_surgery_kit_applications"
  ON surgery_kit_applications FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
REVOKE ALL ON TABLE surgery_kit_applications FROM anon;

COMMENT ON TABLE surgery_kit_applications IS
  'Cada vez que um kit cirurgico e aplicado a uma cirurgia. Guarda quem aplicou, quem conferiu a devolucao e quando — sem isto nao existe devolucao do nao-usado (item 4.1).';

CREATE TABLE IF NOT EXISTS surgery_kit_application_items (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID          NOT NULL REFERENCES clinics(id)                   ON DELETE CASCADE,
  application_id     UUID          NOT NULL REFERENCES surgery_kit_applications(id)  ON DELETE CASCADE,
  stock_item_id      UUID          REFERENCES stock_items(id)                        ON DELETE SET NULL,
  item_name          TEXT          NOT NULL,
  unit               TEXT,

  /** O que o kit mandou para a sala. */
  quantity_planned   NUMERIC(12,3) NOT NULL CHECK (quantity_planned > 0),
  /** O que voltou fechado e entrou de novo no estoque. */
  quantity_returned  NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
  /** O que saiu e não pode voltar (aberto sem uso) — perda, não devolução. */
  quantity_lost      NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity_lost >= 0),

  /** Preço no momento da aplicação — a conta do tutor não muda se a tabela mudar. */
  unit_price         NUMERIC(10,2) NOT NULL DEFAULT 0,

  /** Movimento que baixou o insumo. É por ele que a devolução sabe de quais lotes repor. */
  movement_id        UUID          REFERENCES stock_movements(id)                    ON DELETE SET NULL,
  /** Movimento de crédito gerado pela devolução. */
  return_movement_id UUID          REFERENCES stock_movements(id)                    ON DELETE SET NULL,
  /** Movimento de débito que registrou a perda do que abriu e não usou. */
  loss_movement_id   UUID          REFERENCES stock_movements(id)                    ON DELETE SET NULL,

  returnable         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Devolvido + perdido nunca passa do que saiu. Sem este CHECK, um erro de
  -- digitação na conferência devolveria ao estoque material que nunca existiu.
  CONSTRAINT surgery_kit_item_qtd_coerente
    CHECK (quantity_returned + quantity_lost <= quantity_planned)
);

CREATE INDEX IF NOT EXISTS idx_surgery_kit_app_items_app
  ON surgery_kit_application_items (application_id);
CREATE INDEX IF NOT EXISTS idx_surgery_kit_app_items_stock
  ON surgery_kit_application_items (stock_item_id) WHERE stock_item_id IS NOT NULL;

ALTER TABLE surgery_kit_application_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_surgery_kit_application_items" ON surgery_kit_application_items;
CREATE POLICY "clinic_isolation_surgery_kit_application_items"
  ON surgery_kit_application_items FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
REVOKE ALL ON TABLE surgery_kit_application_items FROM anon;

COMMENT ON TABLE surgery_kit_application_items IS
  'Linha a linha do kit aplicado: o que saiu, o que voltou, o que virou perda, e os movimentos de estoque de cada etapa. A conferencia por excecao (saiu tudo menos o que eu marcar) escreve aqui.';

-- ─── 4.1 · a cobrança passa a ser por linha, para poder ser ajustada ────────
--
-- Hoje o kit vira um único `surgery_charges` com o valor total. Se parte do
-- material voltou, não há o que reduzir. Amarrando a cobrança à aplicação, a
-- conferência ajusta o valor.

ALTER TABLE surgery_charges
  ADD COLUMN IF NOT EXISTS kit_application_id UUID REFERENCES surgery_kit_applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surgery_charges_kit_application
  ON surgery_charges (kit_application_id) WHERE kit_application_id IS NOT NULL;

COMMENT ON COLUMN surgery_charges.kit_application_id IS
  'Aplicacao de kit que gerou esta cobranca. A conferencia da devolucao ajusta o valor desta linha em vez de deixar o tutor pagando o que voltou fechado para o estoque.';

-- ─── 4.2 · liberação forçada do pré-anestésico, com nome e motivo ───────────
--
-- O checklist já existe; o que não existe é consequência. Quais itens TRAVAM
-- fica em `clinics.flow_config` (configurável, porque a resposta é da clínica);
-- o que nunca é configurável é a liberação ficar registrada: urgência acontece,
-- e cesárea de emergência não espera exame pré-operatório — mas fica escrito
-- quem liberou e por quê.

CREATE TABLE IF NOT EXISTS surgery_gate_overrides (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      UUID         NOT NULL REFERENCES clinics(id)   ON DELETE CASCADE,
  surgery_id     UUID         NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
  /** Para qual etapa a trava foi liberada (hoje: 'sala'). */
  target_status  TEXT         NOT NULL,
  /** Quais exigências estavam em falta no momento da liberação. */
  missing        TEXT[]       NOT NULL DEFAULT '{}',
  reason         TEXT         NOT NULL CHECK (length(trim(reason)) >= 3),
  released_by    UUID         REFERENCES profiles(id)           ON DELETE SET NULL,
  released_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surgery_gate_overrides_surgery
  ON surgery_gate_overrides (surgery_id, released_at DESC);
CREATE INDEX IF NOT EXISTS idx_surgery_gate_overrides_clinic
  ON surgery_gate_overrides (clinic_id, released_at DESC);

ALTER TABLE surgery_gate_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_surgery_gate_overrides" ON surgery_gate_overrides;
CREATE POLICY "clinic_isolation_surgery_gate_overrides"
  ON surgery_gate_overrides FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
REVOKE ALL ON TABLE surgery_gate_overrides FROM anon;

COMMENT ON TABLE surgery_gate_overrides IS
  'Liberacao forcada do gate pre-anestesico: a cirurgia foi para a sala sem cumprir alguma exigencia. Motivo obrigatorio e autor registrado — urgencia acontece, mas fica escrito.';

-- ─── 4.3 · mapa das cirurgias do dia ────────────────────────────────────────
--
-- `surgeries` tem `started_at`/`ended_at` (o que aconteceu) mas não tem a hora
-- PREVISTA — e mapa do dia é justamente o previsto.

ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS scheduled_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_duration INTEGER;

ALTER TABLE surgeries DROP CONSTRAINT IF EXISTS surgeries_scheduled_duration_check;
ALTER TABLE surgeries ADD  CONSTRAINT surgeries_scheduled_duration_check
  CHECK (scheduled_duration IS NULL OR (scheduled_duration > 0 AND scheduled_duration <= 1440));

CREATE INDEX IF NOT EXISTS idx_surgeries_mapa_do_dia
  ON surgeries (clinic_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL AND status <> 'canceled';

COMMENT ON COLUMN surgeries.scheduled_at IS
  'Horario PREVISTO da cirurgia (started_at e o real). Base do mapa do dia — item 4.3.';
COMMENT ON COLUMN surgeries.scheduled_duration IS
  'Duracao prevista em minutos, para a escala de sala nao sobrepor procedimentos.';

-- ─── 4.4 · local de armazenagem e endereço de prateleira ────────────────────
--
-- Pergunta 18 ao Vinícius (saldo POR local × saldo único com indicação de onde
-- encontrar) está em aberto. Esta migration entrega o segundo: o local e o
-- endereço dizem ONDE ACHAR, e a conta do estoque continua uma só. Saldo por
-- local muda a apuração inteira e não se faz sem a resposta.

CREATE TABLE IF NOT EXISTS stock_locations (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_locations_nome
  ON stock_locations (clinic_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_stock_locations_clinic
  ON stock_locations (clinic_id, sort_order, name);

ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_stock_locations" ON stock_locations;
CREATE POLICY "clinic_isolation_stock_locations"
  ON stock_locations FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
REVOKE ALL ON TABLE stock_locations FROM anon;

COMMENT ON TABLE stock_locations IS
  'Onde o material fica guardado: estoque central, farmacia da sala, carrinho de anestesia. Indica onde achar — o saldo continua unico (ver pergunta 18 do desenho da Fase 4).';

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES stock_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shelf_code  TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_items_location
  ON stock_items (clinic_id, location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_items_shelf
  ON stock_items (clinic_id, shelf_code) WHERE shelf_code IS NOT NULL;

COMMENT ON COLUMN stock_items.shelf_code IS
  'Endereco de prateleira na nomenclatura da clinica (ex.: A-3-2). Texto livre de proposito: cada clinica ja tem a sua e nao se obriga ninguem a trocar.';

-- ─── 4.4 · sugestão de compra pela saída ────────────────────────────────────
--
-- Ponto de pedido é consumo médio × prazo de entrega. Comprar quando acabou já
-- é tarde: o prazo do fornecedor é o que define quando pedir.

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS lead_time_days    INTEGER,
  ADD COLUMN IF NOT EXISTS coverage_days     INTEGER,
  ADD COLUMN IF NOT EXISTS purchase_multiple NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS purchase_minimum  NUMERIC(12,3);

ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_compra_coerente_check;
ALTER TABLE stock_items ADD  CONSTRAINT stock_items_compra_coerente_check
  CHECK (
    (lead_time_days    IS NULL OR (lead_time_days    >= 0 AND lead_time_days    <= 365))
    AND (coverage_days IS NULL OR (coverage_days     >= 0 AND coverage_days     <= 365))
    AND (purchase_multiple IS NULL OR purchase_multiple > 0)
    AND (purchase_minimum  IS NULL OR purchase_minimum  > 0)
  );

COMMENT ON COLUMN stock_items.lead_time_days IS
  'Prazo medio de entrega do fornecedor, em dias. Define o ponto de pedido: comprar antes de acabar, nao quando acabou.';
COMMENT ON COLUMN stock_items.coverage_days IS
  'Quantos dias de consumo a compra deve cobrir. NULL usa o padrao da clinica.';
COMMENT ON COLUMN stock_items.purchase_multiple IS
  'Embalagem fechada: a sugestao arredonda PARA CIMA neste multiplo (caixa de 100 nao se compra pela metade).';
COMMENT ON COLUMN stock_items.purchase_minimum IS
  'Pedido minimo do fornecedor para este item.';

-- ─── 4.4 · perda com motivo obrigatório ────────────────────────────────────
--
-- Item vencido e material aberto sem uso saem do saldo por aqui. Motivo
-- obrigatório no banco: perda sem motivo é o caminho mais curto para o estoque
-- nunca fechar.

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS loss_reason TEXT;

COMMENT ON COLUMN stock_movements.loss_reason IS
  'Motivo da perda (vencimento, quebra, material aberto sem uso, extravio). Obrigatorio em rpc_register_stock_loss.';

-- ─── 4.1 · devolução PARCIAL: a trava de idempotência muda de forma ────────
--
-- A 0505 garantiu "uma baixa só volta uma vez" com índice ÚNICO em
-- `reversed_movement_id`. Isso basta quando a devolução é tudo-ou-nada, e não
-- basta aqui: do kit voltam 4 de 10 compressas, e amanhã pode voltar mais 2.
--
-- O índice único sai e a trava passa a ser de QUANTIDADE, verificada dentro da
-- própria RPC: a soma do que já voltou nunca pode passar do que saiu. Continua
-- sendo trava de banco, e agora cobre o caso parcial — devolver 11 de 10 falha
-- igual a devolver duas vezes 10.

DROP INDEX IF EXISTS uq_stock_movements_reversal;

CREATE INDEX IF NOT EXISTS idx_stock_movements_reversal
  ON stock_movements (reversed_movement_id) WHERE reversed_movement_id IS NOT NULL;

COMMENT ON COLUMN stock_movements.reversed_movement_id IS
  'Quando este movimento devolve outro, aponta para a baixa revertida. Pode haver varias devolucoes parciais da mesma baixa; rpc_return_stock_consumption impede que a soma passe do que saiu.';

COMMIT;

-- =============================================================================
-- RPC de perda: baixa do saldo com motivo, podendo mirar um lote específico.
--
-- Separada de `rpc_apply_stock_consumption` de propósito: consumo é material que
-- entrou no animal, perda é material que se perdeu. Misturar os dois faz o Livro
-- de Controlados mentir para a Vigilância.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_register_stock_loss(
  p_clinic_id     UUID,
  p_stock_item_id UUID,
  p_quantity      NUMERIC,
  p_reason        TEXT,
  p_batch_id      UUID DEFAULT NULL::UUID,
  p_user_id       UUID DEFAULT NULL::UUID,
  p_reference_id  UUID DEFAULT NULL::UUID,
  p_notes         TEXT DEFAULT NULL::TEXT
) RETURNS TABLE (
  movement_id     UUID,
  quantity_before NUMERIC,
  quantity_after  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_item_qty   NUMERIC;
  v_nome       TEXT;
  v_qty_before NUMERIC;
  v_new_qty    NUMERIC;
  v_remaining  NUMERIC;
  v_take       NUMERIC;
  v_mov_id     UUID;
  v_batch      RECORD;
  v_tomados    JSONB := '[]'::JSONB;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity deve ser positiva (got %)', p_quantity;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'motivo da perda e obrigatorio';
  END IF;

  SELECT quantity, name INTO v_item_qty, v_nome
  FROM stock_items
  WHERE id = p_stock_item_id AND clinic_id = p_clinic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_item % nao encontrado na clinica %', p_stock_item_id, p_clinic_id;
  END IF;

  v_qty_before := COALESCE(v_item_qty, 0);
  v_remaining  := p_quantity;

  IF p_batch_id IS NOT NULL THEN
    -- Perda de um lote determinado: o caso do vencimento, em que o que se perde
    -- é exatamente aquele lote, não "um pouco do saldo".
    PERFORM 1 FROM stock_batches
     WHERE id = p_batch_id AND stock_item_id = p_stock_item_id AND clinic_id = p_clinic_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'lote % nao pertence ao item %', p_batch_id, p_stock_item_id;
    END IF;
    UPDATE stock_batches SET quantity = quantity - v_remaining WHERE id = p_batch_id;
    v_tomados := v_tomados || jsonb_build_object('b', p_batch_id, 'q', v_remaining);
    v_remaining := 0;
  ELSE
    -- Sem lote indicado: FIFO, igual ao consumo.
    FOR v_batch IN
      SELECT id, quantity FROM stock_batches
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

    IF v_remaining > 0 THEN
      INSERT INTO stock_batches (clinic_id, stock_item_id, quantity, received_at)
      VALUES (p_clinic_id, p_stock_item_id, -v_remaining, now());
      v_remaining := 0;
    END IF;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_new_qty
  FROM stock_batches WHERE stock_item_id = p_stock_item_id;

  INSERT INTO stock_movements (
    clinic_id, stock_item_id, medication_name, movement_type,
    quantity_change, quantity_before, quantity_after,
    source, reference_id, notes, created_by, requires_reconciliation, loss_reason
  ) VALUES (
    p_clinic_id, p_stock_item_id, v_nome, 'ADJUSTMENT',
    -p_quantity, v_qty_before, v_new_qty,
    'MANUAL_ADJUSTMENT', p_reference_id, p_notes, p_user_id,
    v_new_qty < 0, trim(p_reason)
  ) RETURNING id INTO v_mov_id;

  IF jsonb_array_length(v_tomados) > 0 THEN
    INSERT INTO stock_movement_batches (clinic_id, movement_id, batch_id, quantity)
    SELECT p_clinic_id, v_mov_id, (e->>'b')::UUID, SUM((e->>'q')::NUMERIC)
    FROM jsonb_array_elements(v_tomados) e
    WHERE (e->>'b') IS NOT NULL
    GROUP BY (e->>'b')::UUID
    HAVING SUM((e->>'q')::NUMERIC) > 0;
  END IF;

  UPDATE stock_items SET quantity = v_new_qty, updated_at = now() WHERE id = p_stock_item_id;

  RETURN QUERY SELECT v_mov_id, v_qty_before, v_new_qty;
END;
$function$;

COMMENT ON FUNCTION public.rpc_register_stock_loss IS
  'Baixa de perda com motivo obrigatorio. Com p_batch_id perde o lote indicado (caso do vencimento); sem ele, FIFO. Grava movimento ADJUSTMENT com loss_reason e o rastro de lote.';

GRANT EXECUTE ON FUNCTION public.rpc_register_stock_loss TO authenticated;

-- =============================================================================
-- Devolução PARCIAL: `rpc_return_stock_consumption` ganha `p_quantity`.
--
-- A versão da 0505 devolvia a baixa inteira — bastava para "a medicação foi
-- removida do prontuário". O kit cirúrgico precisa de parcial: saíram 10
-- compressas, voltaram 4. A quantidade é rateada sobre o rastro de lote na mesma
-- proporção, de modo que o material volte aos lotes de onde saiu.
--
-- A trava de idempotência agora é de quantidade: a soma do que já voltou mais o
-- que se pede não pode passar do que saiu. Devolver 11 de 10 falha, e devolver
-- 10 duas vezes falha — igual ao índice único de antes, mas cobrindo o parcial.
--
-- Assinatura compatível: `p_quantity` entra DEPOIS dos parâmetros existentes e
-- com default NULL, então as chamadas da 0505 continuam valendo e significam
-- "devolve tudo".
-- =============================================================================

-- Acrescentar um parametro com DEFAULT nao substitui a funcao: cria SOBRECARGA,
-- e a chamada de 4 argumentos passa a ser ambigua ("function name is not
-- unique"). A assinatura de 4 parametros da 0505 e derrubada primeiro.
DROP FUNCTION IF EXISTS public.rpc_return_stock_consumption(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.rpc_return_stock_consumption(
  p_clinic_id   UUID,
  p_movement_id UUID,
  p_user_id     UUID DEFAULT NULL::UUID,
  p_notes       TEXT DEFAULT NULL::TEXT,
  p_quantity    NUMERIC DEFAULT NULL::NUMERIC
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
  v_saiu        NUMERIC;
  v_ja_voltou   NUMERIC;
  v_qtd         NUMERIC;
  v_qty_before  NUMERIC;
  v_new_qty     NUMERIC;
  v_mov_id      UUID;
  v_rastro      INTEGER;
  v_rastro_tot  NUMERIC;
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

  v_saiu := ABS(COALESCE(v_orig.quantity_change, 0));
  IF v_saiu = 0 THEN
    RAISE EXCEPTION 'movimento % nao tem quantidade a devolver', p_movement_id;
  END IF;

  -- Quanto desta baixa já voltou em devoluções anteriores.
  SELECT COALESCE(SUM(ABS(quantity_change)), 0) INTO v_ja_voltou
  FROM stock_movements WHERE reversed_movement_id = p_movement_id;

  v_qtd := COALESCE(p_quantity, v_saiu - v_ja_voltou);
  IF v_qtd <= 0 THEN
    RAISE EXCEPTION 'movimento % ja foi devolvido por inteiro', p_movement_id;
  END IF;
  IF v_ja_voltou + v_qtd > v_saiu THEN
    RAISE EXCEPTION 'devolucao de % excede o que saiu no movimento % (saiu %, ja voltou %)',
      v_qtd, p_movement_id, v_saiu, v_ja_voltou;
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

  SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_rastro, v_rastro_tot
  FROM stock_movement_batches smb WHERE smb.movement_id = p_movement_id;

  IF v_rastro > 0 AND v_rastro_tot > 0 THEN
    -- Devolve aos lotes de origem, rateando na proporção do que saiu de cada um.
    -- Devolução total cai no caso exato (fator = 1).
    UPDATE stock_batches sb
       SET quantity = sb.quantity + ROUND(smb.quantity * (v_qtd / v_rastro_tot), 3)
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
  'Devolve ao estoque uma baixa ja aplicada, total ou parcialmente (p_quantity; NULL = o saldo ainda nao devolvido). Repoe nos lotes do rastro de stock_movement_batches, rateando na proporcao do que saiu de cada um; fallback no lote mais recente. A soma das devolucoes nunca passa do que saiu.';

GRANT EXECUTE ON FUNCTION public.rpc_return_stock_consumption TO authenticated;
