-- Corrige o fluxo de estorno entre Caixa e Financeiro.
--
-- Bug: ao estornar uma entrada do caixa (central_cashier.status = 'reversed'),
-- o trigger fn_sync_cashier_status_to_financial() marcava o financial_entry
-- como 'cancelled' — inacessível para nova baixa. O mesmo acontecia ao estornar
-- pelo módulo Financeiro (reverseFinancialEntry colocava como 'pending', mas o
-- update subsequente em central_cashier disparava o trigger que sobrescrevia
-- para 'cancelled').
--
-- Fix: estorno de caixa que já tinha sido pago (recorded/verified) volta o
-- título financeiro para 'pending' e limpa todos os campos de pagamento, para
-- que o usuário possa lançar nova baixa (no caixa novamente OU manualmente).
-- Estorno de caixa que estava 'pending' (transação não concretizada) cancela
-- o título financeiro vinculado.

CREATE OR REPLACE FUNCTION fn_sync_cashier_status_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- qualquer status → reversed: volta o título para pendente (se estava pago)
  -- ou cancela (se ainda estava pendente, indicando que a transação foi anulada).
  IF NEW.status = 'reversed' AND OLD.status <> 'reversed' THEN
    IF OLD.status IN ('recorded','verified') THEN
      -- Caixa estava pago — volta o título para pendente para nova baixa
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
      -- Caixa nunca foi pago (estava pending) — transação anulada por completo
      UPDATE financial_entries
      SET    status     = 'cancelled',
             updated_at = now()
      WHERE  cashier_entry_id = NEW.id
        AND  status = 'pending';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Correção retroativa ─────────────────────────────────────────────────────
-- Títulos que foram marcados como 'cancelled' pelo bug do trigger antigo,
-- mas que estão vinculados a um caixa estornado que originalmente foi pago,
-- devem voltar para 'pending' para que possam ser baixados novamente.
-- Heurística: se há registro do payment_date e settlement_bank_id, o título
-- já foi pago em algum momento e precisa ser recuperado.

UPDATE financial_entries fe
SET    status             = 'pending',
       payment_date       = NULL,
       payment_method     = NULL,
       settlement_bank_id = NULL,
       interest           = 0,
       updated_at         = now()
FROM   central_cashier cc
WHERE  fe.cashier_entry_id = cc.id
  AND  cc.status           = 'reversed'
  AND  fe.status           = 'cancelled'
  AND  fe.payment_date IS NOT NULL;
