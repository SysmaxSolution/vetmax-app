-- 0371 — Backfill: arquiva pendings órfãos do Caixa Central (2026-06-12)
--
-- Bug: ao quitar uma invoice (pagamento normal via rpc_record_split_payment ou
-- baixa como cortesia), o lançamento status='pending' criado no checkout nunca
-- era baixado — ficava inflando o totalizador "A Receber" para sempre.
-- O fix de comportamento está no app (processSplitPayment + markInvoiceAsCourtesy);
-- esta migration sane ia os órfãos já existentes.

UPDATE central_cashier cc
SET    status = 'archived',
       reason = COALESCE(cc.reason, '') || ' · baixado (invoice já liquidada — saneamento 0371)'
WHERE  cc.source_module = 'consultation'
  AND  cc.status        = 'pending'
  AND  EXISTS (
    SELECT 1
    FROM   invoices i
    WHERE  i.id        = cc.source_id
      AND  i.clinic_id = cc.clinic_id
      AND  i.status    = 'paid'
  );
