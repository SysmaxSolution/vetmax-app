-- =============================================================================
-- VetMax — Migration 0118: RLS para Tabelas Financeiras
-- G-09 Módulo Financeiro Core
-- =============================================================================

-- ── financial_entries ─────────────────────────────────────────────────────────

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado da mesma clínica
CREATE POLICY "financial_entries_select_clinic"
  ON public.financial_entries FOR SELECT
  USING (
    clinic_id = (
      SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- Inserção: apenas admin ou receptionist da clínica
CREATE POLICY "financial_entries_insert_clinic"
  ON public.financial_entries FOR INSERT
  WITH CHECK (
    clinic_id = (
      SELECT clinic_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'receptionist')
      LIMIT 1
    )
  );

-- Atualização: apenas admin
CREATE POLICY "financial_entries_update_admin"
  ON public.financial_entries FOR UPDATE
  USING (
    clinic_id = (
      SELECT clinic_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
      LIMIT 1
    )
  );

-- Exclusão: apenas admin
CREATE POLICY "financial_entries_delete_admin"
  ON public.financial_entries FOR DELETE
  USING (
    clinic_id = (
      SELECT clinic_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
      LIMIT 1
    )
  );

-- ── payment_methods ───────────────────────────────────────────────────────────

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_methods_select_clinic"
  ON public.payment_methods FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "payment_methods_write_admin"
  ON public.payment_methods FOR ALL
  USING (
    clinic_id = (
      SELECT clinic_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin' LIMIT 1
    )
  );

-- ── bank_accounts ─────────────────────────────────────────────────────────────

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_accounts_select_clinic"
  ON public.bank_accounts FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );

CREATE POLICY "bank_accounts_write_admin"
  ON public.bank_accounts FOR ALL
  USING (
    clinic_id = (
      SELECT clinic_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin' LIMIT 1
    )
  );

-- Acesso service_role irrestrito (para server actions via admin client)
GRANT ALL ON public.financial_entries TO service_role;
GRANT ALL ON public.payment_methods   TO service_role;
GRANT ALL ON public.bank_accounts     TO service_role;

GRANT SELECT ON public.financial_entries TO authenticated;
GRANT SELECT ON public.payment_methods   TO authenticated;
GRANT SELECT ON public.bank_accounts     TO authenticated;
