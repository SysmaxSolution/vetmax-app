-- =============================================================================
-- VetMax — Migration 0189: refator freemium / onboarding segmentado
--
-- Estratégia (alinhada com PO):
--  - Schema HÍBRIDO (opção C): a verdade do que é Free continua em
--    src/config/access-matrix.ts (FREE_ROUTES). Esta migration adiciona
--    apenas o "escudo" is_legacy e o trigger de provisionamento automático
--    para NOVAS clínicas.
--  - is_legacy = TRUE protege a base atual: nenhuma alteração retroativa de
--    plan_name ou active_modules. Quem paga enterprise continua enterprise.
--  - Novo signup (is_legacy=FALSE) recebe automaticamente:
--      • tenant_subscriptions(plan_name='free', status='active')
--      • active_modules conforme business_type (vet_clinic / pet_aesthetics)
--  - Idempotente: re-aplicar não duplica nem sobrescreve customizações.
-- =============================================================================

BEGIN;

-- ─── 1. Coluna is_legacy ────────────────────────────────────────────────────

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clinics.is_legacy IS
  'TRUE = clínica existente antes do refator de freemium (2026-05-26). Isenta do trigger de provisionamento automático de plano/módulos. Permissões da clínica seguem o plan_name contratado normalmente.';

-- ─── 2. Backfill — todas as clínicas atuais viram legacy ───────────────────

UPDATE clinics
SET is_legacy = TRUE
WHERE created_at < now()
  AND is_legacy = FALSE;

-- ─── 3. Adapta o auto_provision_tenant existente para respeitar is_legacy ──
-- A função pré-existente cria tenant_subscriptions(free) + feature_flags +
-- quotas + user_limit=3. Para is_legacy=TRUE (importação manual de cliente
-- enterprise), NÃO queremos esse comportamento — o suporte provisiona pelo
-- contrato real. Early return preserva a função intocada para signups
-- normais e adiciona o escudo retroativo.

CREATE OR REPLACE FUNCTION public.auto_provision_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Refator freemium 2026-05-26: legacy = importação manual / contrato pré-
  -- existente. NÃO toca em plan/flags/quotas/user_limit — fica como o
  -- suporte configurou.
  IF NEW.is_legacy IS TRUE THEN
    RETURN NEW;
  END IF;

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
$function$;

-- ─── 4. Função de seed dos active_modules conforme business_type ───────────
-- Provisionamento de tenant_subscriptions já é feito pelo auto_provision_
-- tenant existente. Esta função cuida APENAS de active_modules — espelhando
-- FREE_ROUTES em src/config/access-matrix.ts (gate de UI). Mantém os dois
-- gates alinhados.

CREATE OR REPLACE FUNCTION fn_seed_clinic_freemium_modules(
  p_clinic_id     UUID,
  p_business_type TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_modules TEXT[];
BEGIN
  IF p_business_type = 'pet_aesthetics' THEN
    v_modules := ARRAY['cashier','reception','patients','grooming','management'];
  ELSE
    -- vet_clinic (default) e qualquer valor desconhecido caem aqui
    v_modules := ARRAY['cashier','reception','patients','consultation','management'];
  END IF;

  -- Sobrescreve incondicionalmente: o default da coluna clinics.active_modules
  -- contém um array hardcoded amplo que NÃO reflete o plano Free. O trigger
  -- é AFTER INSERT — antes do usuário/suporte tocar; sobrescrever é seguro.
  -- Customizações posteriores ficam preservadas (este trigger só dispara
  -- 1x, no INSERT inicial).
  UPDATE clinics
  SET active_modules = to_jsonb(v_modules)
  WHERE id = p_clinic_id;
END;
$$;

COMMENT ON FUNCTION fn_seed_clinic_freemium_modules IS
  'Sobrescreve clinics.active_modules conforme business_type para um signup novo. Espelha FREE_ROUTES em src/config/access-matrix.ts. Chamado pelo trigger fn_clinics_after_insert_freemium quando is_legacy=FALSE.';

-- ─── 5. Trigger AFTER INSERT em clinics — respeita is_legacy ───────────────

CREATE OR REPLACE FUNCTION fn_clinics_after_insert_freemium()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_legacy IS TRUE THEN
    RETURN NEW;
  END IF;

  PERFORM fn_seed_clinic_freemium_modules(NEW.id, COALESCE(NEW.business_type, 'vet_clinic'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinics_freemium_seed ON clinics;
CREATE TRIGGER trg_clinics_freemium_seed
  AFTER INSERT ON clinics
  FOR EACH ROW
  EXECUTE FUNCTION fn_clinics_after_insert_freemium();

COMMENT ON FUNCTION fn_clinics_after_insert_freemium IS
  'Trigger AFTER INSERT em clinics. Skipa se is_legacy=TRUE. Caso contrário, ajusta active_modules ao plano Free do segmento (FREE_ROUTES espelhado).';

COMMIT;
