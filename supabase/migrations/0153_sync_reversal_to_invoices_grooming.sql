-- Completa o fluxo de estorno: além de financial_entries, o estorno de uma
-- entrada do caixa precisa reverter também o status da fonte original
-- (invoice da consulta ou sessão de grooming). Sem isso, o título não
-- reaparece na aba "Recebimentos" do Caixa, que filtra invoices.status='pending'
-- e grooming_sessions.payment_status='pending'.
--
-- Regra: só reverte se NÃO existir outra entrada de caixa ATIVA
-- (recorded/verified) para a mesma fonte. Isso protege casos onde múltiplas
-- entradas existem (ex: estorno + novo pagamento confirmado).

CREATE OR REPLACE FUNCTION fn_sync_cashier_status_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_has_active_cashier BOOLEAN;
BEGIN
  -- pending → recorded/verified: marca o título como pago
  IF NEW.status IN ('recorded','verified') AND OLD.status = 'pending' THEN
    UPDATE financial_entries
    SET    status         = 'paid',
           payment_date   = COALESCE(NEW.created_at::DATE, CURRENT_DATE),
           payment_method = NEW.payment_method,
           updated_at     = now()
    WHERE  cashier_entry_id = NEW.id
      AND  status = 'pending';
  END IF;

  -- qualquer status → reversed: trata financeiro + fonte (invoice / grooming)
  IF NEW.status = 'reversed' AND OLD.status <> 'reversed' THEN
    -- 1. Sincroniza financial_entries (como antes)
    IF OLD.status IN ('recorded','verified') THEN
      UPDATE financial_entries
      SET    status             = 'pending',
             payment_date       = NULL,
             payment_method     = NULL,
             settlement_bank_id = NULL,
             interest           = 0,
             updated_at         = now()
      WHERE  cashier_entry_id = NEW.id
        AND  status IN ('paid','cancelled');
    ELSE
      UPDATE financial_entries
      SET    status     = 'cancelled',
             updated_at = now()
      WHERE  cashier_entry_id = NEW.id
        AND  status = 'pending';
    END IF;

    -- 2. Verifica se há OUTRA entrada de caixa ativa para a mesma fonte.
    --    Se houver, a fonte continua paga; se não, libera para nova baixa.
    IF NEW.source_id IS NOT NULL AND NEW.source_module IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM central_cashier
         WHERE source_module = NEW.source_module
           AND source_id     = NEW.source_id
           AND id           <> NEW.id
           AND status       IN ('recorded','verified')
      ) INTO v_has_active_cashier;

      IF NOT v_has_active_cashier THEN
        -- 3a. Invoice de consulta
        IF NEW.source_module = 'consultation' THEN
          UPDATE invoices
          SET    status         = 'pending',
                 paid_at        = NULL,
                 payment_method = NULL,
                 updated_at     = now()
          WHERE  id     = NEW.source_id
            AND  status = 'paid';
        END IF;

        -- 3b. Sessão de Banho e Tosa
        IF NEW.source_module = 'grooming' THEN
          UPDATE grooming_sessions
          SET    payment_status      = 'pending',
                 payment_recorded_at = NULL
          WHERE  id             = NEW.source_id
            AND  payment_status = 'paid';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Correção retroativa: invoices/grooming "órfãs" (paid mas caixa reversed) ──

-- Invoices paid sem caixa ativo → voltam para pending
UPDATE invoices i
SET    status         = 'pending',
       paid_at        = NULL,
       payment_method = NULL,
       updated_at     = now()
WHERE  i.status = 'paid'
  AND  EXISTS (
    SELECT 1 FROM central_cashier cc
     WHERE cc.source_module = 'consultation'
       AND cc.source_id     = i.id
       AND cc.status        = 'reversed'
  )
  AND NOT EXISTS (
    SELECT 1 FROM central_cashier cc
     WHERE cc.source_module = 'consultation'
       AND cc.source_id     = i.id
       AND cc.status       IN ('recorded','verified')
  );

-- Grooming sessions paid sem caixa ativo → voltam para pending
UPDATE grooming_sessions gs
SET    payment_status      = 'pending',
       payment_recorded_at = NULL
WHERE  gs.payment_status = 'paid'
  AND  EXISTS (
    SELECT 1 FROM central_cashier cc
     WHERE cc.source_module = 'grooming'
       AND cc.source_id     = gs.id
       AND cc.status        = 'reversed'
  )
  AND NOT EXISTS (
    SELECT 1 FROM central_cashier cc
     WHERE cc.source_module = 'grooming'
       AND cc.source_id     = gs.id
       AND cc.status       IN ('recorded','verified')
  );
