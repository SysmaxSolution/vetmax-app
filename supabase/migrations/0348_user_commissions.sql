-- =============================================================================
-- VetMax — Migration 0149: Motor de Comissões (Sprint 4 — Operação AlmaVet)
--
-- 1. Adiciona mapa_code em profiles
-- 2. Atualiza constraint source em financial_entries para aceitar 'commission'
-- 3. Cria tabela user_commissions com RLS e índices
-- =============================================================================

BEGIN;

-- ─── 1. mapa_code em profiles ─────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mapa_code TEXT;

-- ─── 2. Aceitar source = 'commission' em financial_entries ────────────────────
DO $$
DECLARE
  v_cname TEXT;
BEGIN
  SELECT tc.constraint_name INTO v_cname
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc USING (constraint_name)
  WHERE tc.table_name       = 'financial_entries'
    AND tc.constraint_schema = current_schema()
    AND cc.check_clause      LIKE '%source%'
  LIMIT 1;

  IF v_cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE financial_entries DROP CONSTRAINT %I', v_cname);
  END IF;

  ALTER TABLE financial_entries
    ADD CONSTRAINT financial_entries_source_check
    CHECK (source IN ('manual', 'cashier', 'commission'));

EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ─── 3. Tabela user_commissions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_commissions (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID          NOT NULL REFERENCES clinics(id)   ON DELETE CASCADE,
  user_id     UUID          NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,

  -- 'all' = qualquer item da venda; 'product'/'service'/'package' = por tipo
  item_type   TEXT          NOT NULL DEFAULT 'all'
                CHECK (item_type IN ('all', 'product', 'service', 'package')),

  -- item_id NULL = regra genérica para o tipo; não NULL = produto específico
  item_id     UUID          REFERENCES stock_items(id) ON DELETE SET NULL,

  percentage  NUMERIC(5,2)  NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  description TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, user_id, item_type, item_id)
);

COMMENT ON TABLE user_commissions IS
  'Regras de comissão por profissional. percentage % é aplicado sobre o valor líquido dos itens correspondentes.';

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_commissions_clinic_user
  ON user_commissions (clinic_id, user_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE user_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commissions_clinic_read"
  ON user_commissions FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "commissions_manager_write"
  ON user_commissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id        = auth.uid()
        AND p.clinic_id = user_commissions.clinic_id
        AND p.role      IN ('admin', 'owner', 'manager')
    )
  );

COMMIT;
