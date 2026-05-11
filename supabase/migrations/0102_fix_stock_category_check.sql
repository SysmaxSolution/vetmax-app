-- Migration 0102: Corrige a CHECK constraint de category em stock_items
-- A constraint original (0053) só permitia: 'medication','supply','grooming_supply','other'
-- As migrations 0099 e 0100 adicionaram novas categorias sem atualizar a constraint.

ALTER TABLE stock_items
  DROP CONSTRAINT IF EXISTS stock_items_category_check;

ALTER TABLE stock_items
  ADD CONSTRAINT stock_items_category_check
  CHECK (category IN (
    'medication',
    'controlled_medication',
    'clinic_product',
    'petshop',
    'grooming_supply',
    'aesthetics',
    'other',
    'service',
    'exam'
  ));
