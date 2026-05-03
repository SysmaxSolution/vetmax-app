-- ============================================================
-- 0027_clinic_whatsapp_settings
-- Credenciais WhatsApp por clínica (multi-tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS clinic_whatsapp_settings (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id      uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  provider_name  text NOT NULL DEFAULT 'z-api'
                   CHECK (provider_name IN ('z-api', 'sysmax')),
  api_url        text,
  instance_id    text NOT NULL,
  token          text NOT NULL,
  client_token   text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now() NOT NULL,
  updated_at     timestamptz DEFAULT now() NOT NULL
);

-- Uma configuração por clínica
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_settings_clinic_unique
  ON clinic_whatsapp_settings (clinic_id);

-- RLS — isolamento total por clinic_id
ALTER TABLE clinic_whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_settings_clinic_isolation" ON clinic_whatsapp_settings
  FOR ALL USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
  );

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION set_whatsapp_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_whatsapp_settings_updated_at
  BEFORE UPDATE ON clinic_whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION set_whatsapp_settings_updated_at();
