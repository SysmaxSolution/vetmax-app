-- 0359 — Soft-delete de stock_items (produtos e serviços)
--
-- DELETE físico de stock_items falha por FK em consultation_services,
-- stock_movements, invoice_items e outras. Soft-delete via archived_at
-- preserva o histórico e remove o item das listagens operacionais.
--
-- Sprint 2026-06-03 — fix exclusão "Taxa da maquininha" + lapidação geral.

BEGIN;

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_items_archived
  ON stock_items (clinic_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_items_active
  ON stock_items (clinic_id, is_service)
  WHERE archived_at IS NULL;

COMMIT;
