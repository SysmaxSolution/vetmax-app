-- 0446 — Estudos de imagem (raio-X / ultrassom / TC) + entrega ao VET SOLICITANTE.
--
-- Necessidade do cliente (grupo Animais, centro de diagnóstico por imagem):
-- o veterinário EXTERNO que encaminhou o pet quer receber, por e-mail, o LINK
-- das imagens assim que elas sobem à nuvem — ANTES do laudo assinado — e depois
-- o laudo. Hoje o sistema não tem: (a) armazenamento de imagem/DICOM, (b) o
-- conceito de "vet solicitante" (pessoa externa) por exame, (c) link tokenizado
-- expirável. Esta migration adiciona os três. Aditiva + idempotente.
--
-- Fluxo: imaging_studies (1 por estudo) → imaging_files (N imagens/DICOM) →
-- imaging_share_links (token opaco expirável entregue por e-mail ao vet/tutor).

BEGIN;

-- ── Bucket privado para imagens/DICOM (acesso só via signed URL do server) ──
-- DICOM é pesado: limite de 300 MB por arquivo. Sem políticas p/ authenticated →
-- todo acesso é mediado pelo server (service_role).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('imaging-files', 'imaging-files', false, 314572800, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Estudo de imagem ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS imaging_studies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL,
  patient_id          uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id     uuid REFERENCES consultations(id) ON DELETE SET NULL,   -- a O.S.
  exam_request_id     uuid REFERENCES exam_requests(id) ON DELETE SET NULL,   -- a ordem de exame
  modality            text,                 -- 'radiografia','ultrassom','tomografia','ressonancia','outro'
  title               text,                 -- ex.: "Raio-X tórax 2 incidências"
  notes               text,
  -- Vet solicitante (pessoa EXTERNA que encaminhou; conceito novo no schema)
  referring_vet_name  text,
  referring_vet_email text,
  referring_vet_crmv  text,
  partner_clinic_id   uuid REFERENCES partner_clinics(id) ON DELETE SET NULL, -- clínica de origem, se cadastrada
  -- Estado do estudo
  status              text NOT NULL DEFAULT 'awaiting_images'
                        CHECK (status IN ('awaiting_images','images_ready','reported','cancelled')),
  images_uploaded_at   timestamptz,          -- 1º upload de imagem (dispara e-mail ao vet)
  images_email_sent_at timestamptz,
  -- Laudo assinado (documento gerado no fluxo patient_documents)
  laudo_document_id    uuid REFERENCES patient_documents(id) ON DELETE SET NULL,
  laudo_released_at    timestamptz,          -- laudo liberado (dispara 2º e-mail)
  laudo_email_sent_at  timestamptz,
  -- Visibilidade ao tutor (gate separado — plano B: tutor repassa ao vet dele)
  released_to_tutor_at timestamptz,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imaging_studies_clinic       ON imaging_studies (clinic_id);
CREATE INDEX IF NOT EXISTS idx_imaging_studies_patient      ON imaging_studies (patient_id);
CREATE INDEX IF NOT EXISTS idx_imaging_studies_consultation ON imaging_studies (consultation_id);

ALTER TABLE imaging_studies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'imaging_studies' AND policyname = 'imaging_studies_tenant') THEN
    CREATE POLICY imaging_studies_tenant ON imaging_studies
      USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- ── Arquivos (imagens/DICOM/preview) de um estudo ──────────────────────────
CREATE TABLE IF NOT EXISTS imaging_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL,
  study_id     uuid NOT NULL REFERENCES imaging_studies(id) ON DELETE CASCADE,
  storage_path text NOT NULL,               -- {clinic_id}/{study_id}/{ts}_{arquivo}
  file_name    text,
  content_type text,
  kind         text NOT NULL DEFAULT 'image'
                 CHECK (kind IN ('image','dicom','preview','other')),
  size_bytes   bigint,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imaging_files_study  ON imaging_files (study_id);
CREATE INDEX IF NOT EXISTS idx_imaging_files_clinic ON imaging_files (clinic_id);

ALTER TABLE imaging_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'imaging_files' AND policyname = 'imaging_files_tenant') THEN
    CREATE POLICY imaging_files_tenant ON imaging_files
      USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- ── Links de compartilhamento tokenizados (entregues por e-mail) ───────────
-- O token opaco é a capability; diferente da carteira pública (UUID cru), aqui
-- há token dedicado com expiração e revogação, pois expõe laudo/imagem.
CREATE TABLE IF NOT EXISTS imaging_share_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  study_id        uuid NOT NULL REFERENCES imaging_studies(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  audience        text NOT NULL DEFAULT 'referring_vet'
                    CHECK (audience IN ('referring_vet','tutor')),
  recipient_email text,
  expires_at      timestamptz,              -- NULL = sem expiração
  revoked_at      timestamptz,
  view_count      integer NOT NULL DEFAULT 0,
  last_viewed_at  timestamptz,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imaging_share_links_study ON imaging_share_links (study_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_imaging_share_links_token ON imaging_share_links (token);

ALTER TABLE imaging_share_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'imaging_share_links' AND policyname = 'imaging_share_links_tenant') THEN
    CREATE POLICY imaging_share_links_tenant ON imaging_share_links
      USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

COMMIT;
