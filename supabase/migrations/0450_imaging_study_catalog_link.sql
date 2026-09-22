-- 0450 — Vincula estudo de imagem a um serviço do catálogo (Fase 3).
-- Permite que o flag clinic_catalog.publish_to_portal (por serviço) decida se o
-- laudo, ao ser liberado, vai automaticamente ao Portal do Tutor. Aditiva.
BEGIN;
ALTER TABLE imaging_studies
  ADD COLUMN IF NOT EXISTS catalog_item_id uuid REFERENCES clinic_catalog(id) ON DELETE SET NULL;
COMMIT;
