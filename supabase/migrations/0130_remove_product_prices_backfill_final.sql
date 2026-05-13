-- ─── 0130: Migração final — product_prices → stock_items e remoção da Tabela de Preços ─
-- A migration 0100 já fez o backfill inicial. Esta migration copia apenas registros
-- ativos que ainda não existam em stock_items (inseridos após 0100).

INSERT INTO public.stock_items (
  clinic_id,
  name,
  category,
  unit_price,
  is_service,
  quantity,
  unit,
  is_active
)
SELECT
  pp.clinic_id,
  pp.name,
  CASE pp.category
    WHEN 'services'          THEN 'service'
    WHEN 'exams'             THEN 'exam'
    WHEN 'medications'       THEN 'medication'
    WHEN 'grooming_supplies' THEN 'grooming_supply'
    ELSE 'other'
  END,
  pp.price,
  CASE pp.category
    WHEN 'services' THEN true
    WHEN 'exams'    THEN true
    ELSE false
  END,
  0,
  'un',
  true
FROM public.product_prices pp
WHERE pp.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.stock_items si
    WHERE si.clinic_id = pp.clinic_id
      AND si.name = pp.name
  );
