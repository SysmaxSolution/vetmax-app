-- 0427: corrige duplicidade no Financeiro para pagamentos de CONSULTA.
--
-- O pagamento de fatura de consulta cria a própria baixa em financial_entries
-- (billing.ts → "Recebimento de fatura", vinculada à invoice). O trigger
-- fn_sync_cashier_entry_to_financial TAMBÉM espelhava o central_cashier
-- correspondente (source_module='consultation') → o mesmo recebimento aparecia
-- DUAS vezes. Correção: pular source_module='consultation' (que já tem baixa
-- própria). Demais origens (manual/adiantamento, sales, grooming) seguem
-- espelhadas.
--
-- IMPORTANTE: parte do corpo VIGENTE da função (versão 0191): dedup por
-- NOT EXISTS (o índice único de cashier_entry_id é PARCIAL, então ON CONFLICT
-- (cashier_entry_id) puro NÃO funciona) + uso de effective_date + suporte a
-- status pending. Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION fn_sync_cashier_entry_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_effective_date DATE;
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;

  -- Pagamentos de consulta já têm baixa própria (billing.ts). Não espelhar aqui,
  -- senão o título fica duplicado no Financeiro.
  IF NEW.source_module = 'consultation' THEN RETURN NEW; END IF;

  v_effective_date := COALESCE(NEW.effective_date, NEW.created_at::DATE);

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
      v_effective_date,
      CASE WHEN NEW.status = 'pending' THEN NULL ELSE v_effective_date END,
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
