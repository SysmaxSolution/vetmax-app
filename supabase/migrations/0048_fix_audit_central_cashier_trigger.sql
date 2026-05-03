-- =============================================================================
-- VetMax — Migration 0048: Fix audit_central_cashier trigger
--
-- Problema: audit_central_cashier() usa colunas que não existem em audit_logs
-- (table_name, record_id, old_value, new_value, actor_id) enquanto a tabela
-- audit_logs usa entity_type, entity_id, action, details, user_id.
-- =============================================================================

BEGIN;

-- Corrigir a função para usar o schema real de audit_logs
CREATE OR REPLACE FUNCTION audit_central_cashier()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    clinic_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    created_at
  ) VALUES (
    NEW.clinic_id,
    auth.uid(),
    TG_OP,
    'central_cashier',
    NEW.id,
    jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    ),
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
