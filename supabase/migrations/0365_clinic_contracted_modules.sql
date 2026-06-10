-- 0365 — Monetização SaaS Fase 1: módulos contratados por clínica
-- Verdade de billing por clínica. module_key referencia subscription_module_catalog
-- (chave comercial) OU uma module key técnica legada (backfill de clinics.active_modules)
-- — sem FK por design. Escrita exclusiva via service_role.
BEGIN;

CREATE TABLE IF NOT EXISTS clinic_contracted_modules (
  clinic_id     UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  module_key    TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  contracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, module_key)
);

COMMENT ON TABLE clinic_contracted_modules IS
  'Módulos contratados por clínica (verdade de billing do plano Premium/Specialized). Linhas com module_key fora do catálogo são keys técnicas legadas do backfill de clinics.active_modules.';

ALTER TABLE clinic_contracted_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracted_modules_select_own" ON clinic_contracted_modules;
CREATE POLICY "contracted_modules_select_own"
  ON clinic_contracted_modules FOR SELECT TO authenticated
  USING (clinic_id = get_user_clinic_id());
-- Sem policies de INSERT/UPDATE/DELETE: escrita exclusiva via service_role.

CREATE OR REPLACE FUNCTION fn_clinic_contracted_modules_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_clinic_contracted_modules_touch ON clinic_contracted_modules;
CREATE TRIGGER trg_clinic_contracted_modules_touch
  BEFORE UPDATE ON clinic_contracted_modules
  FOR EACH ROW EXECUTE FUNCTION fn_clinic_contracted_modules_touch();

-- Backfill / grandfathering (idempotente): toda clínica existente ganha 1 linha
-- por module key presente em clinics.active_modules. Garante que NINGUÉM perde
-- acesso no deploy do gatekeeper — módulo contratado ativo libera independente
-- do plano (cobrança não existe na Fase 1).
INSERT INTO clinic_contracted_modules (clinic_id, module_key)
  SELECT c.id, m.key
  FROM clinics c,
       LATERAL jsonb_array_elements_text(COALESCE(c.active_modules, '[]'::jsonb)) AS m(key)
  ON CONFLICT (clinic_id, module_key) DO NOTHING;

COMMIT;
