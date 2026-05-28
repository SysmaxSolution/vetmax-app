-- PLG Sprint 2 — Cota diária do Mentor IA + coluna reset_interval
-- Separa unidades: ai_mentor_tokens (mensal) vs ai_mentor_daily (1 msg/dia no Free)

-- Adiciona intervalo de reset configurável por recurso
ALTER TABLE tenant_quotas
  ADD COLUMN IF NOT EXISTS reset_interval TEXT NOT NULL DEFAULT 'monthly'
  CHECK (reset_interval IN ('daily', 'monthly'));

-- Atualiza registros existentes com intervalo padrão mensal
UPDATE tenant_quotas SET reset_interval = 'monthly' WHERE reset_interval IS NULL;

-- Atualiza check_quota para respeitar o intervalo configurado por recurso
CREATE OR REPLACE FUNCTION check_quota(p_clinic_id UUID, p_resource TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rows_updated INTEGER;
  v_interval     TEXT;
BEGIN
  SELECT reset_interval INTO v_interval
    FROM tenant_quotas
    WHERE clinic_id = p_clinic_id AND resource_name = p_resource;

  IF NOT FOUND THEN RETURN TRUE; END IF;

  -- Auto-reset com intervalo correto (daily ou monthly)
  UPDATE tenant_quotas
    SET used_amount = 0,
        reset_date  = CASE
          WHEN reset_interval = 'daily'
            THEN (CURRENT_DATE + INTERVAL '1 day')::date
          ELSE (CURRENT_DATE + INTERVAL '1 month')::date
        END,
        updated_at  = NOW()
    WHERE clinic_id    = p_clinic_id
      AND resource_name = p_resource
      AND reset_date IS NOT NULL
      AND reset_date <= CURRENT_DATE;

  -- Atomic check + increment
  UPDATE tenant_quotas
    SET used_amount = used_amount + 1,
        updated_at  = NOW()
    WHERE clinic_id    = p_clinic_id
      AND resource_name = p_resource
      AND limit_amount  > 0
      AND used_amount   < limit_amount;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    PERFORM 1 FROM tenant_quotas
      WHERE clinic_id = p_clinic_id AND resource_name = p_resource;
    IF NOT FOUND THEN RETURN TRUE; END IF;
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Atualiza trigger de auto-provisionamento para incluir ai_mentor_daily
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

  INSERT INTO tenant_quotas (clinic_id, resource_name, limit_amount, reset_date, reset_interval)
    VALUES
      (NEW.id, 'whatsapp_messages', 100,   (CURRENT_DATE + INTERVAL '1 month')::date, 'monthly'),
      (NEW.id, 'ai_mentor_tokens',  50000, (CURRENT_DATE + INTERVAL '1 month')::date, 'monthly'),
      (NEW.id, 'ai_mentor_daily',   1,     (CURRENT_DATE + INTERVAL '1 day')::date,   'daily')
    ON CONFLICT (clinic_id, resource_name) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Seed: provisiona ai_mentor_daily para clínicas existentes
INSERT INTO tenant_quotas (clinic_id, resource_name, limit_amount, reset_date, reset_interval)
  SELECT id, 'ai_mentor_daily', 1, (CURRENT_DATE + INTERVAL '1 day')::date, 'daily'
  FROM clinics
  ON CONFLICT (clinic_id, resource_name) DO NOTHING;

COMMENT ON COLUMN tenant_quotas.reset_interval IS
  'Intervalo de reset: daily (mentor gratuito) ou monthly (WhatsApp, tokens IA).';
