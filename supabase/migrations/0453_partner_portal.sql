-- 0453 — Portal do veterinário SOLICITANTE (clínica parceira) — Fase 3.
--
-- A clínica que ENCAMINHA (partner_clinics) ganha:
--  • um acesso ADMINISTRATIVO (vê todos os pets que ela encaminhou);
--  • profissionais (MVs) cadastrados, cada um com um código que filtra só os pets
--    que AQUELE profissional encaminhou.
-- Login por CÓDIGO ÚNICO (formato PPPPP-SSSSSS): PPPPP público (lookup) + SSSSSS
-- secreto (guardado só como hash). Sem profissional cadastrado → só o acesso geral.
-- Aditiva + idempotente.

BEGIN;

-- Código admin da clínica parceira (acesso geral = todos os pets encaminhados)
ALTER TABLE partner_clinics
  ADD COLUMN IF NOT EXISTS code_public       text,
  ADD COLUMN IF NOT EXISTS code_secret_hash  text,
  ADD COLUMN IF NOT EXISTS code_set_at        timestamptz,
  ADD COLUMN IF NOT EXISTS code_fail_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS code_locked_until  timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_clinics_code_public ON partner_clinics (code_public) WHERE code_public IS NOT NULL;

-- Profissionais (MVs) da clínica parceira
CREATE TABLE IF NOT EXISTS partner_clinic_professionals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL,
  partner_clinic_id uuid NOT NULL REFERENCES partner_clinics(id) ON DELETE CASCADE,
  name              text NOT NULL,
  crmv              text,
  email             text,
  phone             text,
  is_active         boolean NOT NULL DEFAULT true,
  code_public       text,
  code_secret_hash  text,
  code_set_at       timestamptz,
  code_fail_count   integer NOT NULL DEFAULT 0,
  code_locked_until timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_professionals_clinic ON partner_clinic_professionals (partner_clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_professionals_code_public ON partner_clinic_professionals (code_public) WHERE code_public IS NOT NULL;

ALTER TABLE partner_clinic_professionals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='partner_clinic_professionals' AND policyname='partner_professionals_tenant') THEN
    CREATE POLICY partner_professionals_tenant ON partner_clinic_professionals
      USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- Liga o exame de imagem ao profissional solicitante (filtro por MV)
ALTER TABLE imaging_studies
  ADD COLUMN IF NOT EXISTS referring_professional_id uuid REFERENCES partner_clinic_professionals(id) ON DELETE SET NULL;

-- Sessão do portal do parceiro (cookie próprio; acesso só via admin client)
CREATE TABLE IF NOT EXISTS partner_clinic_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL CHECK (kind IN ('admin','professional')),
  partner_clinic_id uuid NOT NULL,
  professional_id   uuid,
  clinic_id         uuid NOT NULL,
  session_token     text NOT NULL UNIQUE,
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_sessions_token ON partner_clinic_sessions (session_token);
ALTER TABLE partner_clinic_sessions ENABLE ROW LEVEL SECURITY;

COMMIT;
