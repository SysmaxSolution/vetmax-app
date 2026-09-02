-- 0427: corrige duplicidade no Financeiro para pagamentos de CONSULTA.
--
-- O pagamento de fatura de consulta cria a própria baixa em financial_entries
-- (billing.ts → "Recebimento de fatura", vinculada à invoice). O trigger 0127
-- (fn_sync_cashier_entry_to_financial) TAMBÉM espelhava o central_cashier
-- correspondente (source_module='consultation') como um segundo título → o mesmo
-- recebimento aparecia DUAS vezes no Financeiro.
--
-- Correção: o trigger passa a NÃO espelhar lançamentos de caixa cuja origem já
-- gera a própria baixa no Financeiro (source_module='consultation'). Demais
-- origens (manual/adiantamento, sales, grooming, etc.) continuam espelhadas —
-- para elas o espelho do caixa é o único título e deve permanecer.
-- Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION fn_sync_cashier_entry_to_financial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;

  -- Pagamentos de consulta já têm baixa própria (billing.ts). Não espelhar aqui,
  -- senão o título fica duplicado no Financeiro.
  IF NEW.source_module = 'consultation' THEN RETURN NEW; END IF;

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
    NEW.created_at::DATE,
    'paid',
    NEW.payment_method,
    'cashier',
    NEW.id,
    NEW.recorded_by,
    NEW.created_at,
    NEW.created_at
  )
  ON CONFLICT (cashier_entry_id) DO NOTHING;

  RETURN NEW;
END;
$$;
