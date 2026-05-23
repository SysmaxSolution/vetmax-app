-- =============================================================================
-- VetMax — Migration 0184: corrige trigger de sync de cashier_outflows
--
-- Bug em produção: ao registrar uma saída no Caixa, o INSERT em
-- cashier_outflows dispara o trigger trg_cashier_outflow_to_financial, que
-- tenta inserir um espelho em financial_entries com ON CONFLICT
-- (cashier_outflow_id) DO NOTHING. O índice único existente
-- (uidx_financial_cashier_outflow) é PARCIAL — tem WHERE cashier_outflow_id
-- IS NOT NULL. Postgres exige que o ON CONFLICT use exatamente o mesmo
-- predicado, senão dispara:
--     "there is no unique or exclusion constraint matching the
--      ON CONFLICT specification"
--
-- Solução: replicar o predicado parcial no ON CONFLICT.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_sync_cashier_outflow_to_financial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
  ON CONFLICT (cashier_outflow_id) WHERE cashier_outflow_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$function$;

COMMIT;
