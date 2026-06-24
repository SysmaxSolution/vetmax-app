-- 0409: marketing_attribution — liga campanha (utm/creative) ao cadastro de trial.
-- Fecha o loop de medição (F2): qual reel/criativo trouxe qual clínica.
-- Aditiva. Insert/leitura só via service role (server action); RLS sem policy pública.

CREATE TABLE IF NOT EXISTS marketing_attribution (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT,
  clinic_id     UUID        REFERENCES clinics(id) ON DELETE SET NULL,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_content   TEXT,
  creative_id   TEXT,
  landing_path  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_attribution_campaign
  ON marketing_attribution (utm_campaign, utm_content);
CREATE INDEX IF NOT EXISTS idx_marketing_attribution_email
  ON marketing_attribution (email);

ALTER TABLE marketing_attribution ENABLE ROW LEVEL SECURITY;
-- Sem policy: apenas a service role (server action) insere/lê. Sem acesso anônimo.
