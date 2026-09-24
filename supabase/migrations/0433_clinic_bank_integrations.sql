-- 0433: 1.3/PIX — configuração de integrações financeiras por clínica (gating).
-- Vive em Gestão > Configurações > Financeiro. Guarda os toggles e as credenciais
-- por banco/PIX. Segredos ficam em JSONB (recomendação futura: cifrar/Vault). Aditiva.
CREATE TABLE IF NOT EXISTS clinic_bank_integrations (
  clinic_id    uuid PRIMARY KEY,
  bank_enabled boolean NOT NULL DEFAULT false,
  banks        jsonb   NOT NULL DEFAULT '[]'::jsonb,   -- [{bank_code, provider, environment, client_id, agencia, conta}]
  pix_enabled  boolean NOT NULL DEFAULT false,
  pix          jsonb   NOT NULL DEFAULT '{}'::jsonb,    -- {provider, environment, client_id, client_secret, token, pix_key}
  updated_at   timestamptz NOT NULL DEFAULT now()
);
