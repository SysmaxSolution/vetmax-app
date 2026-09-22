-- 0465 — Fontes por clínica para o motor de layouts (Canvas Nativo).
-- Upload de TTF/OTF/WOFF/WOFF2 (≤ 5 MB) em bucket privado, isolado por clinic_id,
-- registrado em clinic_fonts. O editor e o print injetam @font-face a partir
-- de signed URLs; o PDF (html2canvas) rasteriza o texto já com a fonte aplicada.

CREATE TABLE IF NOT EXISTS clinic_fonts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  family_name   TEXT NOT NULL,                       -- nome usado em font-family
  storage_path  TEXT NOT NULL,                       -- <clinic_id>/<uuid>.<ext> no bucket clinic-fonts
  format        TEXT NOT NULL CHECK (format IN ('truetype','opentype','woff','woff2')),
  font_weight   INTEGER NOT NULL DEFAULT 400 CHECK (font_weight BETWEEN 100 AND 900),
  font_style    TEXT NOT NULL DEFAULT 'normal' CHECK (font_style IN ('normal','italic')),
  file_size     INTEGER,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_clinic_fonts_variant UNIQUE (clinic_id, family_name, font_weight, font_style)
);

CREATE INDEX IF NOT EXISTS idx_clinic_fonts_clinic ON clinic_fonts (clinic_id);

ALTER TABLE clinic_fonts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_fonts_select_own_clinic" ON clinic_fonts;
CREATE POLICY "clinic_fonts_select_own_clinic"
  ON clinic_fonts FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "clinic_fonts_admin_insert" ON clinic_fonts;
CREATE POLICY "clinic_fonts_admin_insert"
  ON clinic_fonts FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "clinic_fonts_admin_update" ON clinic_fonts;
CREATE POLICY "clinic_fonts_admin_update"
  ON clinic_fonts FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "clinic_fonts_admin_delete" ON clinic_fonts;
CREATE POLICY "clinic_fonts_admin_delete"
  ON clinic_fonts FOR DELETE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Bucket privado. Browsers mandam Content-Type variado para fontes
-- (font/ttf, application/x-font-ttf, octet-stream) — lista ampla.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinic-fonts', 'clinic-fonts', false,
  5242880,  -- 5 MB
  ARRAY[
    'font/ttf','font/otf','font/woff','font/woff2','font/sfnt',
    'application/x-font-ttf','application/x-font-otf','application/x-font-truetype',
    'application/x-font-opentype','application/font-sfnt','application/vnd.ms-opentype',
    'application/font-woff','application/font-woff2','application/octet-stream'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "clinic_fonts_read_clinic" ON storage.objects;
CREATE POLICY "clinic_fonts_read_clinic"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'clinic-fonts'
    AND (storage.foldername(name))[1] = (SELECT clinic_id::text FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "clinic_fonts_write_admin" ON storage.objects;
CREATE POLICY "clinic_fonts_write_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'clinic-fonts'
    AND (storage.foldername(name))[1] = (SELECT clinic_id::text FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "clinic_fonts_delete_admin" ON storage.objects;
CREATE POLICY "clinic_fonts_delete_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'clinic-fonts'
    AND (storage.foldername(name))[1] = (SELECT clinic_id::text FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

COMMENT ON TABLE clinic_fonts IS 'Fontes enviadas pela clínica para uso nos modelos de documento (Canvas Nativo). Arquivo no bucket privado clinic-fonts.';
