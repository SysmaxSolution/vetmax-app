-- Recupera lançamentos no Caixa Central para as invoices que foram revertidas
-- pela migration 0154 (caso Batman/Ropet e similares).
--
-- O Caixa Central calcula totais a partir de central_cashier.status='pending'.
-- Sem novas entradas pendentes, esses valores não aparecem no dashboard.
--
-- Estratégia (operação única, backfill):
-- 1) Atualiza fn_sync_cashier_entry_to_financial para preferir relinkar um
--    financial_entry pré-existente da mesma fonte ao novo cashier (cobre
--    fluxos futuros sem duplicar). Usa LIMIT 1 + ORDER para escolher apenas
--    uma row e não violar o índice único uidx_financial_cashier_entry.
-- 2) Apaga financial_entries vinculados a cashiers reversed/archived das
--    invoices órfãs (estavam inativos e sem valor contábil) — libera o
--    índice único para os novos.
-- 3) Insere entradas 'pending' em central_cashier para cada invoice pending
--    sem caixa ativo. O trigger AFTER INSERT cria os novos financial_entries.

-- ─── 1. Trigger AFTER INSERT inteligente ─────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_sync_cashier_entry_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target_fe UUID;
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;

  -- Tenta relinkar um único financial_entry da mesma fonte (o mais recente)
  -- ao novo cashier. Sem isso, INSERTs após reversão geram entradas duplicadas.
  IF NEW.source_id IS NOT NULL AND NEW.source_module IS NOT NULL THEN
    SELECT fe.id INTO v_target_fe
    FROM   financial_entries fe
    JOIN   central_cashier cc ON cc.id = fe.cashier_entry_id
    WHERE  cc.source_module = NEW.source_module
      AND  cc.source_id     = NEW.source_id
      AND  cc.id           <> NEW.id
    ORDER  BY fe.created_at DESC
    LIMIT  1;

    IF v_target_fe IS NOT NULL THEN
      UPDATE financial_entries
      SET    cashier_entry_id = NEW.id,
             status         = CASE WHEN NEW.status = 'pending' THEN 'pending' ELSE 'paid' END,
             amount         = NEW.amount,
             payment_date   = CASE WHEN NEW.status = 'pending' THEN NULL ELSE NEW.created_at::DATE END,
             payment_method = NEW.payment_method,
             updated_at     = now()
      WHERE  id = v_target_fe;
      RETURN NEW;
    END IF;
  END IF;

  -- Sem entrada pré-existente: cria nova
  IF NOT EXISTS (SELECT 1 FROM financial_entries WHERE cashier_entry_id = NEW.id) THEN
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
      CASE WHEN NEW.status = 'pending' THEN NULL ELSE NEW.created_at::DATE END,
      CASE WHEN NEW.status = 'pending' THEN 'pending' ELSE 'paid' END,
      NEW.payment_method,
      'cashier',
      NEW.id,
      NEW.recorded_by,
      NEW.created_at,
      NEW.created_at
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 2. Limpa financial_entries antigos das invoices/grooming órfãs ──────────
-- Esses entries estão linkados a cashiers reversed/archived (sem valor contábil
-- ativo). A deleção libera o índice único para os novos entries do trigger.

DELETE FROM financial_entries fe
USING central_cashier cc, invoices i
WHERE  fe.cashier_entry_id = cc.id
  AND  cc.source_module    = 'consultation'
  AND  cc.source_id        = i.id
  AND  cc.status          IN ('reversed','archived')
  AND  i.status            = 'pending'
  AND  NOT EXISTS (
    SELECT 1 FROM central_cashier cc2
    WHERE cc2.source_module = 'consultation'
      AND cc2.source_id     = i.id
      AND cc2.status       IN ('pending','recorded','verified')
  );

DELETE FROM financial_entries fe
USING central_cashier cc, grooming_sessions gs
WHERE  fe.cashier_entry_id = cc.id
  AND  cc.source_module    = 'grooming'
  AND  cc.source_id        = gs.id
  AND  cc.status          IN ('reversed','archived')
  AND  gs.payment_status   = 'pending'
  AND  NOT EXISTS (
    SELECT 1 FROM central_cashier cc2
    WHERE cc2.source_module = 'grooming'
      AND cc2.source_id     = gs.id
      AND cc2.status       IN ('pending','recorded','verified')
  );

-- ─── 3. Backfill: cria entradas pending para invoices órfãs ─────────────────

INSERT INTO central_cashier (
  clinic_id, source_module, source_id, amount, status,
  reason, patient_name, tutor_name, recorded_by
)
SELECT
  i.clinic_id, 'consultation', i.id, i.total_amount, 'pending',
  'Consulta — ' || COALESCE(p.name, 'Paciente'),
  p.name, t.name, NULL
FROM   invoices i
LEFT   JOIN patients p ON p.id = i.patient_id
LEFT   JOIN tutors   t ON t.id = i.tutor_id
WHERE  i.status = 'pending'
  AND  i.total_amount > 0
  AND  NOT EXISTS (
    SELECT 1 FROM central_cashier cc
    WHERE  cc.source_module = 'consultation'
      AND  cc.source_id     = i.id
      AND  cc.status       IN ('pending','recorded','verified')
  );

-- ─── 4. Mesmo backfill para grooming_sessions ────────────────────────────────

INSERT INTO central_cashier (
  clinic_id, source_module, source_id, amount, status,
  reason, patient_name, tutor_name, recorded_by
)
SELECT
  gs.clinic_id, 'grooming', gs.id, gs.price_total, 'pending',
  'Banho e Tosa — ' || COALESCE(p.name, 'Paciente'),
  p.name, t.name, NULL
FROM   grooming_sessions gs
LEFT   JOIN patients p ON p.id = gs.patient_id
LEFT   JOIN tutors   t ON t.id = gs.tutor_id
WHERE  gs.payment_status = 'pending'
  AND  gs.price_total > 0
  AND  NOT EXISTS (
    SELECT 1 FROM central_cashier cc
    WHERE  cc.source_module = 'grooming'
      AND  cc.source_id     = gs.id
      AND  cc.status       IN ('pending','recorded','verified')
  );
