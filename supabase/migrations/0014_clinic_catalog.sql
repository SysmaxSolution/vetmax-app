-- ─── Migration 0014: Catálogo de Preços da Clínica ──────────────────────────

CREATE TABLE IF NOT EXISTS clinic_catalog (
  id         UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id  UUID          NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  item_type  TEXT          NOT NULL CHECK (item_type IN ('consultation', 'medication', 'exam', 'other')),
  name       TEXT          NOT NULL,
  price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active  BOOLEAN       NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_clinic ON clinic_catalog (clinic_id, is_active);

ALTER TABLE clinic_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_select" ON clinic_catalog FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "catalog_insert" ON clinic_catalog FOR INSERT
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "catalog_update" ON clinic_catalog FOR UPDATE
  USING  (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "catalog_delete" ON clinic_catalog FOR DELETE
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1));
