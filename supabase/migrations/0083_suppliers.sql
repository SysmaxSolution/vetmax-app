-- =============================================================================
-- VetMax — Migration 0083: Cadastro de Fornecedores
--
-- Cria tabela `suppliers` (clinic_id) + FK em cashier_outflows.supplier_id.
-- RLS multi-tenant: SELECT por clínica; INSERT/UPDATE/DELETE só admin/owner/manager.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela suppliers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID         NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL,
  document        TEXT,
  category        TEXT         NOT NULL DEFAULT 'outros',
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  contact_person  TEXT,
  notes           TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by      UUID         REFERENCES profiles(id),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT suppliers_name_min_len CHECK (length(trim(name)) >= 2),
  CONSTRAINT suppliers_category_valid
    CHECK (category IN ('medicamentos','alimentos','equipamentos','servicos','limpeza','escritorio','outros')),
  CONSTRAINT suppliers_unique_per_clinic UNIQUE (clinic_id, name)
);

COMMENT ON TABLE  suppliers                IS 'Cadastro de fornecedores por clínica (multi-tenant)';
COMMENT ON COLUMN suppliers.category       IS 'medicamentos|alimentos|equipamentos|servicos|limpeza|escritorio|outros';
COMMENT ON COLUMN suppliers.document       IS 'CNPJ ou CPF (sem máscara)';
COMMENT ON COLUMN suppliers.is_active      IS 'Soft delete — fornecedores inativos não aparecem em autocomplete';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Índices
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_suppliers_clinic_active
  ON suppliers (clinic_id, name)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_suppliers_category
  ON suppliers (clinic_id, category)
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION suppliers_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION suppliers_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS Policies
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro da clínica pode listar fornecedores
DROP POLICY IF EXISTS "suppliers_select_clinic" ON suppliers;
CREATE POLICY "suppliers_select_clinic"
  ON suppliers FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- INSERT: admin/owner/manager
DROP POLICY IF EXISTS "suppliers_insert_managers" ON suppliers;
CREATE POLICY "suppliers_insert_managers"
  ON suppliers FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner','manager')
  );

-- UPDATE: admin/owner/manager
DROP POLICY IF EXISTS "suppliers_update_managers" ON suppliers;
CREATE POLICY "suppliers_update_managers"
  ON suppliers FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner','manager')
  )
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- DELETE: apenas admin/owner (soft delete via is_active é o caminho preferido)
DROP POLICY IF EXISTS "suppliers_delete_admin" ON suppliers;
CREATE POLICY "suppliers_delete_admin"
  ON suppliers FOR DELETE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. FK em cashier_outflows.supplier_id (opcional)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cashier_outflows
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cashier_outflows_supplier
  ON cashier_outflows (clinic_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

COMMENT ON COLUMN cashier_outflows.supplier_id IS 'FK opcional para suppliers; NULL para saídas sem fornecedor (sangria, despesas avulsas)';

COMMIT;
