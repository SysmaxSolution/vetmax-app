-- ─── Migration 0015: Clinic Settings — White-label & Workflow Engine ─────────

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS logo_url        TEXT,
  ADD COLUMN IF NOT EXISTS active_modules  JSONB    NOT NULL DEFAULT '["reception","triage","consultation","exams","billing"]',
  ADD COLUMN IF NOT EXISTS continuous_flow BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flow_config     JSONB    NOT NULL DEFAULT '{"vet_merged_modules":[]}';

-- Bucket público para logos de clínicas
INSERT INTO storage.buckets (id, name, public)
VALUES ('clinic-logos', 'clinic-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies de storage para logos
CREATE POLICY "logos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'clinic-logos');

CREATE POLICY "logos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clinic-logos');

CREATE POLICY "logos_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'clinic-logos');

CREATE POLICY "logos_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'clinic-logos');
