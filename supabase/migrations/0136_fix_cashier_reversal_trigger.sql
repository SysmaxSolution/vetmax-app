-- Corrige trigger de sincronização: ao reverter lançamento do caixa,
-- o título financeiro volta para 'pending' (não 'cancelled')
CREATE OR REPLACE FUNCTION public.fn_sync_cashier_status_to_financial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Quando lançamento do caixa é confirmado (pending→recorded), paga o título
  IF NEW.status IN ('recorded','verified') AND OLD.status = 'pending' THEN
    UPDATE financial_entries
    SET    status         = 'paid',
           payment_date   = COALESCE(NEW.created_at::DATE, CURRENT_DATE),
           payment_method = NEW.payment_method,
           updated_at     = now()
    WHERE  cashier_entry_id = NEW.id
      AND  status = 'pending';
  END IF;

  -- Quando lançamento é revertido, volta o título para pendente (estorno = desfazer baixa)
  IF NEW.status = 'reversed' AND OLD.status <> 'reversed' THEN
    UPDATE financial_entries
    SET    status         = 'pending',
           payment_date   = NULL,
           payment_method = NULL,
           updated_at     = now()
    WHERE  cashier_entry_id = NEW.id
      AND  status <> 'pending';
  END IF;

  RETURN NEW;
END;
$function$;
