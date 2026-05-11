-- Migration 0100: Unifica Tabela de Preços (product_prices) com stock_items
-- Serviços e procedimentos passam a viver em stock_items com is_service = true

-- 1. Nova coluna
ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS is_service boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN stock_items.is_service IS
  'true = serviço/procedimento (sem controle de estoque físico). false = produto físico.';

-- 2. Índice para separação rápida produtos vs serviços
CREATE INDEX IF NOT EXISTS idx_stock_items_is_service
  ON stock_items (clinic_id, is_service);

-- 3. Migrar product_prices → stock_items
--    Mapeamento de categorias:
--      services          → service  (is_service = true)
--      exams             → exam     (is_service = true)
--      other             → service  (is_service = true)
--      grooming_supplies → grooming_supply (is_service = false, produto)
--      medications       → medication     (is_service = false, produto)
--
--    ON CONFLICT: ignora se já existe item com mesmo nome na clínica.
INSERT INTO stock_items
  (clinic_id, name, category, quantity, unit, min_quantity, unit_price, is_service, created_at)
SELECT
  pp.clinic_id,
  pp.name,
  CASE pp.category
    WHEN 'services'          THEN 'service'
    WHEN 'exams'             THEN 'exam'
    WHEN 'grooming_supplies' THEN 'grooming_supply'
    WHEN 'medications'       THEN 'medication'
    ELSE                          'service'
  END                        AS category,
  0                          AS quantity,
  'un'                       AS unit,
  0                          AS min_quantity,
  pp.price                   AS unit_price,
  CASE pp.category
    WHEN 'grooming_supplies' THEN false
    WHEN 'medications'       THEN false
    ELSE                          true
  END                        AS is_service,
  pp.created_at
FROM product_prices pp
WHERE pp.is_active = true
ON CONFLICT (clinic_id, name) DO NOTHING;
