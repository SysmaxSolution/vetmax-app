-- 0441 — Livro de Controlados (Fase 1 · item 1.7).
-- Campos para a razão POR SUBSTÂNCIA e a separação HUMANA × VETERINÁRIA exigidas
-- pela Portaria 344/1998 + RDC 22/2014. Aditiva + idempotente.

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS substance     text,               -- princípio ativo (razão por substância)
  ADD COLUMN IF NOT EXISTS concentration text,               -- ex.: "50 mg/mL"
  ADD COLUMN IF NOT EXISTS is_human_use  boolean NOT NULL DEFAULT false, -- true=forma humana; false=veterinária
  ADD COLUMN IF NOT EXISTS control_class text;               -- lista Portaria 344: A1/A2/A3/B1/B2/C1... (opcional)

COMMENT ON COLUMN stock_items.substance     IS 'Princípio ativo — base da razão por substância no Livro de Controlados';
COMMENT ON COLUMN stock_items.is_human_use  IS 'Escrituração separada: true=forma farmacêutica humana, false=veterinária';
COMMENT ON COLUMN stock_items.control_class IS 'Lista da Portaria 344/1998 (A1/A2/A3/B1/B2/C1/C5...)';
