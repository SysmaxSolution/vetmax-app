-- Sprint 3 PLG — Repositório de Ideias (Feature Requests capturados pelo Mentor IA)

CREATE TABLE IF NOT EXISTS feature_requests (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  feature_name  TEXT        NOT NULL,
  user_message  TEXT        NOT NULL,
  priority      TEXT        NOT NULL DEFAULT 'medium'
                CHECK (priority  IN ('low', 'medium', 'high')),
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status    IN ('pending', 'planned', 'in_progress', 'done')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_tenant       ON feature_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_feature_name ON feature_requests(feature_name);
CREATE INDEX IF NOT EXISTS idx_feature_requests_status       ON feature_requests(status);

ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;

-- Clínica lê apenas seus próprios pedidos
CREATE POLICY "clinic reads own feature_requests"
  ON feature_requests FOR SELECT
  USING (tenant_id = (
    SELECT clinic_id FROM profiles WHERE id = auth.uid()
  ));

-- updated_at automático
CREATE OR REPLACE FUNCTION trg_feature_requests_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_feature_requests_updated_at
  BEFORE UPDATE ON feature_requests
  FOR EACH ROW EXECUTE FUNCTION trg_feature_requests_set_updated_at();
