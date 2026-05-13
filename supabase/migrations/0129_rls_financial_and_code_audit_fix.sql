-- ─── 0129: RLS financeiro — recria políticas e corrige isolamento multi-tenant ─
-- Problema: migrations 0116 e 0118 tentaram criar políticas com nomes idênticos.
-- O segundo CREATE POLICY falhou silenciosamente, deixando o banco sem a política
-- corrigida (0118). Esta migration dropa todas e recria em estado limpo.

-- ─── Helper: clinic_id do usuário autenticado ─────────────────────────────────

CREATE OR REPLACE FUNCTION auth_clinic_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

-- ─── financial_entries ────────────────────────────────────────────────────────

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_entries_select_clinic"  ON public.financial_entries;
DROP POLICY IF EXISTS "financial_entries_insert_clinic"  ON public.financial_entries;
DROP POLICY IF EXISTS "financial_entries_update_admin"   ON public.financial_entries;
DROP POLICY IF EXISTS "financial_entries_delete_admin"   ON public.financial_entries;

CREATE POLICY "financial_entries_select_clinic"
  ON public.financial_entries FOR SELECT
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "financial_entries_insert_clinic"
  ON public.financial_entries FOR INSERT
  WITH CHECK (clinic_id = auth_clinic_id());

CREATE POLICY "financial_entries_update_clinic"
  ON public.financial_entries FOR UPDATE
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "financial_entries_delete_clinic"
  ON public.financial_entries FOR DELETE
  USING (clinic_id = auth_clinic_id());

-- ─── payment_methods ──────────────────────────────────────────────────────────

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_methods_select_clinic" ON public.payment_methods;
DROP POLICY IF EXISTS "payment_methods_write_admin"   ON public.payment_methods;

CREATE POLICY "payment_methods_select_clinic"
  ON public.payment_methods FOR SELECT
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "payment_methods_write_clinic"
  ON public.payment_methods FOR ALL
  USING (clinic_id = auth_clinic_id());

-- ─── bank_accounts ────────────────────────────────────────────────────────────

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_accounts_select_clinic" ON public.bank_accounts;
DROP POLICY IF EXISTS "bank_accounts_write_admin"   ON public.bank_accounts;

CREATE POLICY "bank_accounts_select_clinic"
  ON public.bank_accounts FOR SELECT
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "bank_accounts_write_clinic"
  ON public.bank_accounts FOR ALL
  USING (clinic_id = auth_clinic_id());

-- ─── chart_of_accounts ───────────────────────────────────────────────────────

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chart_of_accounts_select_clinic" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "chart_of_accounts_write_admin"   ON public.chart_of_accounts;
DROP POLICY IF EXISTS "chart_of_accounts_clinic_select" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "chart_of_accounts_clinic_write"  ON public.chart_of_accounts;

CREATE POLICY "chart_of_accounts_select_clinic"
  ON public.chart_of_accounts FOR SELECT
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "chart_of_accounts_write_clinic"
  ON public.chart_of_accounts FOR ALL
  USING (clinic_id = auth_clinic_id());

-- ─── credit_cards ─────────────────────────────────────────────────────────────

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_cards_select_clinic" ON public.credit_cards;
DROP POLICY IF EXISTS "credit_cards_write_admin"   ON public.credit_cards;
DROP POLICY IF EXISTS "credit_cards_clinic_select" ON public.credit_cards;
DROP POLICY IF EXISTS "credit_cards_clinic_write"  ON public.credit_cards;

CREATE POLICY "credit_cards_select_clinic"
  ON public.credit_cards FOR SELECT
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "credit_cards_write_clinic"
  ON public.credit_cards FOR ALL
  USING (clinic_id = auth_clinic_id());

-- ─── employees ────────────────────────────────────────────────────────────────

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees_select_clinic" ON public.employees;
DROP POLICY IF EXISTS "employees_write_admin"   ON public.employees;
DROP POLICY IF EXISTS "employees_clinic_select" ON public.employees;
DROP POLICY IF EXISTS "employees_clinic_write"  ON public.employees;

CREATE POLICY "employees_select_clinic"
  ON public.employees FOR SELECT
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "employees_write_clinic"
  ON public.employees FOR ALL
  USING (clinic_id = auth_clinic_id());

-- ─── bank_statements ──────────────────────────────────────────────────────────

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_statements_select_clinic" ON public.bank_statements;
DROP POLICY IF EXISTS "bank_statements_write_clinic"  ON public.bank_statements;

CREATE POLICY "bank_statements_select_clinic"
  ON public.bank_statements FOR SELECT
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "bank_statements_write_clinic"
  ON public.bank_statements FOR ALL
  USING (clinic_id = auth_clinic_id());

-- ─── reconciliation_batches ───────────────────────────────────────────────────

ALTER TABLE public.reconciliation_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reconciliation_batches_select_clinic" ON public.reconciliation_batches;
DROP POLICY IF EXISTS "reconciliation_batches_write_clinic"  ON public.reconciliation_batches;

CREATE POLICY "reconciliation_batches_select_clinic"
  ON public.reconciliation_batches FOR SELECT
  USING (clinic_id = auth_clinic_id());

CREATE POLICY "reconciliation_batches_write_clinic"
  ON public.reconciliation_batches FOR ALL
  USING (clinic_id = auth_clinic_id());

-- ─── Grants ───────────────────────────────────────────────────────────────────
-- service_role (admin client) bypassa RLS — GRANTs adicionais para autenticados

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_entries      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_cards           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statements        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_batches TO authenticated;
