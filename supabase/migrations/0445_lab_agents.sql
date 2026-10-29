-- 0445 — Agentes-ponte de laboratório (Fase 2). Cada agente (serviço no PC da
-- LAN do laboratório) autentica na nuvem por um TOKEN gerado na UI (código de
-- pareamento). O ambiente (DEV/prod) é escolhido na instalação do agente (URL
-- base); o token vive no banco do ambiente onde foi gerado. Aditiva.

CREATE TABLE IF NOT EXISTS lab_agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL,
  token         text NOT NULL UNIQUE,      -- código de pareamento / bearer token
  label         text,                      -- ex.: "PC Hematologia (URIT)"
  is_active     boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  last_ip       text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_agents_clinic ON lab_agents (clinic_id);
CREATE INDEX IF NOT EXISTS idx_lab_agents_token ON lab_agents (token);

ALTER TABLE lab_agents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lab_agents' AND policyname = 'lab_agents_tenant') THEN
    CREATE POLICY lab_agents_tenant ON lab_agents
      USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;
