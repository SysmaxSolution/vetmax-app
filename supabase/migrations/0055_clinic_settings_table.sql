-- =============================================================================
-- VetMax — Migration 0055: clinic_settings (tabela dedicada)
-- Os testes E2E (rls-multitenant TC-RLS-10) esperam uma tabela `clinic_settings`
-- com clinic_id, business_hours, working_days e holiday_work.
-- Nota: Migration 0015 adicionou colunas em `clinics` — esta tabela é separada
-- para permitir upsert e RLS granular por clínica conforme os specs.
-- =============================================================================

CREATE TABLE IF NOT EXISTS clinic_settings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE UNIQUE,
  business_hours jsonb       NOT NULL DEFAULT '{}'::jsonb,
  working_days   integer[]   NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  holiday_work   boolean     NOT NULL DEFAULT false,
  timezone       text        NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_settings_clinic
  ON clinic_settings(clinic_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_clinic_settings_updated_at ON clinic_settings;
CREATE TRIGGER trg_clinic_settings_updated_at
  BEFORE UPDATE ON clinic_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE clinic_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_clinic_settings" ON clinic_settings;
CREATE POLICY "clinic_isolation_clinic_settings"
  ON clinic_settings FOR ALL TO authenticated
  USING  (clinic_id = get_user_clinic_id())
  WITH CHECK (clinic_id = get_user_clinic_id());
