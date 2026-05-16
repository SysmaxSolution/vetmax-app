-- Corrige invoices marcadas como 'paid' mas que NÃO foram efetivamente
-- recebidas — a consulta vinculada ainda tem payment_status='pending'.
--
-- Causa raiz: processInvoicePayment marca invoice.status='paid' antes de
-- chamar rpc_record_invoice_payment. Se a RPC falha (ex: cashier já
-- arquivado por fechamento de sessão), o erro é apenas logado e a
-- invoice fica "paga" sem registro real no caixa.
--
-- Critério para correção: invoice.status='paid' E consultation.payment_status='pending'
-- E (não há central_cashier ativo OU o cashier não tem payment_method).
--
-- Ação:
--   1. Marca o cashier "fantasma" (pending/archived sem payment_method) como
--      'reversed' para liberar o caminho para nova baixa.
--   2. Reverte a invoice para 'pending', limpa paid_at e payment_method.
--
-- O trigger fn_sync_cashier_status_to_financial (0153) dispara após o passo 1
-- e sincroniza financial_entries automaticamente.

-- ─── 1. Reverte cashiers "fantasmas" ─────────────────────────────────────────
-- Constraint central_cashier_reversal_integrity exige reversed_by NOT NULL.
-- Usamos o recorded_by original; se for NULL, usamos um admin da clínica.
UPDATE central_cashier cc
SET    status          = 'reversed',
       reversal_reason = 'Recuperação automática — invoice marcada como paga sem confirmação real no caixa',
       reversed_at     = now(),
       reversed_by     = COALESCE(
         cc.recorded_by,
         (SELECT pr.id FROM profiles pr WHERE pr.clinic_id = cc.clinic_id AND pr.role = 'admin' LIMIT 1),
         (SELECT pr.id FROM profiles pr WHERE pr.clinic_id = cc.clinic_id LIMIT 1)
       )
WHERE  cc.source_module = 'consultation'
  AND  cc.status        IN ('pending', 'archived')
  AND  cc.payment_method IS NULL
  AND  EXISTS (
    SELECT 1
    FROM   invoices i
    JOIN   consultations cons ON cons.id = i.consultation_id
    WHERE  i.id = cc.source_id
      AND  i.status = 'paid'
      AND  cons.payment_status = 'pending'
  );

-- ─── 2. Reverte invoices órfãs ───────────────────────────────────────────────
-- Atualiza invoices onde a consulta ainda diz 'pending' (fonte da verdade)
-- e não há cashier ativo (recorded/verified) que justifique status 'paid'.
UPDATE invoices i
SET    status         = 'pending',
       paid_at        = NULL,
       payment_method = NULL,
       updated_at     = now()
FROM   consultations c
WHERE  i.consultation_id  = c.id
  AND  i.status           = 'paid'
  AND  c.payment_status   = 'pending'
  AND  NOT EXISTS (
    SELECT 1 FROM central_cashier cc
    WHERE cc.source_module = 'consultation'
      AND cc.source_id     = i.id
      AND cc.status        IN ('recorded', 'verified')
      AND cc.payment_method IS NOT NULL
  );
