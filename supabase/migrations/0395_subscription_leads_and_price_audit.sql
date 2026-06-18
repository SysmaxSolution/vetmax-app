-- 0395 — SaaS Fase 2 (R5/D4): captura de lead do Especializado + auditoria de preço
-- D4 (Council 2026-06-18): plano Especializado vira lead+quote (captura no app, não
-- WhatsApp solto) e o preço é definido por admin Sysmax COM log de auditoria
-- (quem / quando / valor anterior → novo). Aditiva e idempotente. Escrita via service_role.
BEGIN;

-- ── 1. Leads do plano Especializado ────────────────────────────────────────
-- A clínica monta a combinação de módulos no configurador e "solicita proposta";
-- o registro alimenta o funil comercial da Sysmax. A clínica vê os próprios leads
-- (status do atendimento); a escrita é exclusiva via service_role (action).
CREATE TABLE IF NOT EXISTS subscription_leads (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  requested_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  contact_name        TEXT,
  contact_email       TEXT,
  contact_phone       TEXT,
  desired_module_keys TEXT[]      NOT NULL DEFAULT '{}',
  estimate_monthly    NUMERIC(12,2),
  message             TEXT,
  status              TEXT        NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'contacted', 'won', 'lost')),
  handled_by          UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscription_leads IS
  'Funil comercial do plano Especializado (R5/D4). Lead criado pela clínica via configurador; tratado pelo time Sysmax. Escrita exclusiva via service_role.';

CREATE INDEX IF NOT EXISTS idx_subscription_leads_clinic ON subscription_leads (clinic_id);
CREATE INDEX IF NOT EXISTS idx_subscription_leads_status ON subscription_leads (status, created_at DESC);

ALTER TABLE subscription_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_leads_select_own" ON subscription_leads;
CREATE POLICY "subscription_leads_select_own"
  ON subscription_leads FOR SELECT TO authenticated
  USING (clinic_id = get_user_clinic_id());
-- Sem INSERT/UPDATE/DELETE: escrita exclusiva via service_role. O time Sysmax lê
-- todos os leads via service_role na action (guard de is_sysmax no servidor).

CREATE OR REPLACE FUNCTION fn_subscription_leads_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_subscription_leads_touch ON subscription_leads;
CREATE TRIGGER trg_subscription_leads_touch
  BEFORE UPDATE ON subscription_leads
  FOR EACH ROW EXECUTE FUNCTION fn_subscription_leads_touch();

-- ── 2. Auditoria de preço (D4) ──────────────────────────────────────────────
-- Append-only. Cobre o preço sob medida do Especializado (specialized_clinic),
-- o preço avulso de cada módulo do catálogo (catalog_module) e os valores-base
-- dos planos (plan_config). SELECT/INSERT só via service_role (sem policies).
CREATE TABLE IF NOT EXISTS subscription_price_audit (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope            TEXT        NOT NULL
                     CHECK (scope IN ('specialized_clinic', 'catalog_module', 'plan_config')),
  clinic_id        UUID        REFERENCES clinics(id) ON DELETE SET NULL,
  target_key       TEXT,
  old_value        NUMERIC(12,2),
  new_value        NUMERIC(12,2),
  changed_by       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  changed_by_email TEXT,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscription_price_audit IS
  'Trilha de auditoria de preços da assinatura (D4): quem/quando/valor anterior→novo. Append-only, acesso exclusivo via service_role (gate de is_sysmax na action).';

CREATE INDEX IF NOT EXISTS idx_subscription_price_audit_clinic ON subscription_price_audit (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_price_audit_scope  ON subscription_price_audit (scope, created_at DESC);

ALTER TABLE subscription_price_audit ENABLE ROW LEVEL SECURITY;
-- Sem policies: leitura e escrita exclusivas via service_role.

COMMIT;
