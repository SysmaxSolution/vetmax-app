-- PLG Sprint 1 — Motor de cotas + auto-provisionamento + check_quota atômico
-- check_quota(): verifica E incrementa em operação única (sem race condition TOCTOU).

CREATE TABLE IF NOT EXISTS tenant_quotas (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID    NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  resource_name TEXT    NOT NULL,
  limit_amount  INTEGER NOT NULL DEFAULT 0,  -- 0 = recurso bloqueado no plano atual
  used_amount   INTEGER NOT NULL DEFAULT 0,
  reset_date    DATE    DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_quotas_clinic_resource_key UNIQUE (clinic_id, resource_name)
);

COMMENT ON TABLE tenant_quotas IS
  'Cotas de uso por recurso por tenant. Reset mensal automático via check_quota().';
COMMENT ON COLUMN tenant_quotas.limit_amount IS
  'Limite máximo do período. 0 = recurso bloqueado neste plano (paywall).';
COMMENT ON COLUMN tenant_quotas.used_amount IS
  'Consumo do período corrente. Incrementado atomicamente por check_quota().';
COMMENT ON COLUMN tenant_quotas.reset_date IS
  'Data de reset do contador. Após esta data, check_quota() zera used_amount automaticamente.';

CREATE INDEX IF NOT EXISTS idx_tenant_quotas_clinic_resource
  ON tenant_quotas(clinic_id, resource_name);

-- RLS: leitura apenas para membros da própria clínica
ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_quotas_select_own"
  ON tenant_quotas FOR SELECT
  USING (
    clinic_id = (
      SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- ─── Trigger: auto-provisionamento ao criar clínica ──────────────────────────
-- SECURITY DEFINER + search_path fixo evita privilege escalation via schema injection
CREATE OR REPLACE FUNCTION auto_provision_tenant()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO tenant_subscriptions (clinic_id, plan_name, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (clinic_id) DO NOTHING;

  INSERT INTO tenant_feature_flags (clinic_id)
    VALUES (NEW.id)
    ON CONFLICT (clinic_id) DO NOTHING;

  INSERT INTO tenant_quotas (clinic_id, resource_name, limit_amount, reset_date)
    VALUES
      (NEW.id, 'whatsapp_messages', 100,   (CURRENT_DATE + INTERVAL '1 month')::date),
      (NEW.id, 'ai_mentor_tokens',  50000, (CURRENT_DATE + INTERVAL '1 month')::date)
    ON CONFLICT (clinic_id, resource_name) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_provision_tenant ON clinics;
CREATE TRIGGER trg_auto_provision_tenant
  AFTER INSERT ON clinics
  FOR EACH ROW EXECUTE FUNCTION auto_provision_tenant();

-- ─── RPC: check_quota — atômico (check + increment em um único UPDATE) ────────
-- Elimina race condition TOCTOU: nenhuma janela entre verificação e consumo.
-- Retorna TRUE (operação permitida + cota decrementada) ou FALSE (limite atingido).
-- Recursos sem cota configurada retornam TRUE (ilimitado por omissão).
CREATE OR REPLACE FUNCTION check_quota(p_clinic_id UUID, p_resource TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  -- Auto-reset mensal: zera o contador quando o período expirou
  UPDATE tenant_quotas
    SET used_amount = 0,
        reset_date  = (CURRENT_DATE + INTERVAL '1 month')::date,
        updated_at  = NOW()
    WHERE clinic_id    = p_clinic_id
      AND resource_name = p_resource
      AND reset_date IS NOT NULL
      AND reset_date <= CURRENT_DATE;

  -- Atomic check-and-increment: só executa se ainda há saldo (used < limit)
  UPDATE tenant_quotas
    SET used_amount = used_amount + 1,
        updated_at  = NOW()
    WHERE clinic_id    = p_clinic_id
      AND resource_name = p_resource
      AND limit_amount  > 0
      AND used_amount   < limit_amount;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    -- Distingue "sem cota configurada" (ilimitado) de "cota esgotada" (bloqueado)
    PERFORM 1 FROM tenant_quotas
      WHERE clinic_id = p_clinic_id AND resource_name = p_resource;
    -- Recurso não configurado = sem limitação neste plano
    IF NOT FOUND THEN RETURN TRUE; END IF;
    -- Recurso configurado mas UPDATE não executou = limite atingido ou limit_amount = 0
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION check_quota IS
  'Verifica E consome 1 unidade de cota atomicamente. FALSE = paywall (barrar operação).
  Recursos sem linha em tenant_quotas retornam TRUE (ilimitado). Seguro para concorrência.';

-- Seed: provisiona cotas padrão Free para clínicas existentes
INSERT INTO tenant_quotas (clinic_id, resource_name, limit_amount, reset_date)
  SELECT id, 'whatsapp_messages', 100, (CURRENT_DATE + INTERVAL '1 month')::date
  FROM clinics ON CONFLICT (clinic_id, resource_name) DO NOTHING;

INSERT INTO tenant_quotas (clinic_id, resource_name, limit_amount, reset_date)
  SELECT id, 'ai_mentor_tokens', 50000, (CURRENT_DATE + INTERVAL '1 month')::date
  FROM clinics ON CONFLICT (clinic_id, resource_name) DO NOTHING;
