-- Sprint PLG — Beta period: todas as clínicas atuais já estão no plano enterprise
-- (sem bloqueios). Novas clínicas continuam em Free com 3 usuários e abas restritas.

-- ── 1. Upgrade plano de TODAS as clínicas existentes para enterprise ──────────
UPDATE tenant_subscriptions
  SET plan_name  = 'enterprise',
      status     = 'active',
      updated_at = NOW()
  WHERE plan_name <> 'enterprise';

-- ── 2. Libera todas as feature flags premium para as clínicas atuais ──────────
UPDATE tenant_feature_flags SET
  has_advanced_finance   = TRUE,
  has_smart_packages     = TRUE,
  has_tef_integration    = TRUE,
  has_document_templates = TRUE,
  updated_at             = NOW();

-- ── 3. Eleva cotas de uso para "praticamente ilimitado" nas clínicas atuais ───
UPDATE tenant_quotas SET
  limit_amount = 999999,
  used_amount  = 0,
  updated_at   = NOW()
  WHERE resource_name IN ('whatsapp_messages', 'ai_mentor_tokens', 'ai_mentor_daily');

-- ── 4. user_limit: existentes = 999 (sem restrição); novas = 3 (default) ──────
UPDATE clinics SET user_limit = 999 WHERE user_limit IS NULL OR user_limit < 999;

ALTER TABLE clinics ALTER COLUMN user_limit SET DEFAULT 3;

-- ── 5. Trigger auto_provision_tenant: novas clínicas Free com 3 user_limit ────
-- Sobrescreve user_limit para 3 SOMENTE para clínicas recém-criadas (Free).
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

  -- Free plan: limite de 3 usuários (override do default)
  UPDATE clinics
    SET user_limit = 3
    WHERE id = NEW.id
      AND (user_limit IS NULL OR user_limit > 3);

  RETURN NEW;
END;
$$;
