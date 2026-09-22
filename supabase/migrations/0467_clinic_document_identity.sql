-- 0467 — Identidade documental por clínica (motor de layouts v2).
-- Uma linha por clínica com a configuração (JSONB) de logo, cabeçalho,
-- rodapé, cores, fonte padrão, página padrão e assinatura. Os modelos
-- Canvas herdam a identidade ao nascer (createBlankCanvasTemplate) e o
-- editor tem a macro "Aplicar identidade da clínica".
-- Shape do JSON: src/lib/canva/identity.ts (DocumentIdentity, version 1).

CREATE TABLE IF NOT EXISTS clinic_document_identity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clinic_document_identity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdi_select_own_clinic" ON clinic_document_identity;
CREATE POLICY "cdi_select_own_clinic"
  ON clinic_document_identity FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "cdi_admin_insert" ON clinic_document_identity;
CREATE POLICY "cdi_admin_insert"
  ON clinic_document_identity FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "cdi_admin_update" ON clinic_document_identity;
CREATE POLICY "cdi_admin_update"
  ON clinic_document_identity FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "cdi_admin_delete" ON clinic_document_identity;
CREATE POLICY "cdi_admin_delete"
  ON clinic_document_identity FOR DELETE
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

COMMENT ON TABLE clinic_document_identity IS 'Identidade documental (cabeçalho/rodapé/cores/fonte/página/assinatura) herdada pelos modelos Canvas da clínica.';
