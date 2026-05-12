-- =============================================================================
-- VetMax — Migration 0104: Cashier RLS — Extend Roles
-- Problema: SELECT na central_cashier bloqueava manager e receptionist,
-- impedindo que esses perfis vissem lançamentos no Caixa Central.
-- =============================================================================

BEGIN;

-- Atualiza policy SELECT de central_cashier para incluir manager e receptionist
DROP POLICY IF EXISTS "central_cashier_select_clinic" ON central_cashier;

CREATE POLICY "central_cashier_select_clinic"
  ON central_cashier FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()) AND
    (SELECT role FROM profiles WHERE id = auth.uid())
      IN ('admin', 'owner', 'accountant', 'manager', 'receptionist')
  );

COMMIT;
