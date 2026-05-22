-- ============================================================================
-- 0176_fix_rpc_record_invoice_payment_overload.sql
-- ============================================================================
-- A migration 0060 criou rpc_record_invoice_payment(7 args + p_session_id) e a
-- 0128 criou uma nova versão (7 args, sem p_session_id) via CREATE OR REPLACE.
-- Como o Postgres trata assinaturas diferentes como funções distintas, ambas
-- coexistem em pg_proc, causando o erro do PostgREST:
--   "Could not choose the best candidate function between..."
-- ao invocar a RPC do app.
--
-- Esta migration:
--   1. Remove a versão obsoleta (com p_session_id), que retorna TABLE.
--   2. Mantém a versão canônica (7 args, RETURNS VOID), definida em 0128.
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_record_invoice_payment(
  UUID,          -- p_clinic_id
  UUID,          -- p_invoice_id
  NUMERIC,       -- p_amount
  TEXT,          -- p_payment_method
  TEXT,          -- p_patient_name
  TEXT,          -- p_tutor_name
  UUID,          -- p_recorded_by
  UUID           -- p_session_id  ← assinatura obsoleta
);
