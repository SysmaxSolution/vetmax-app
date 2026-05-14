-- ─── Operação Smart Packages ─────────────────────────────────────────────────
-- Fase 1: Motor de Pacotes e Planos

-- Catálogo de pacotes da clínica
CREATE TABLE IF NOT EXISTS catalog_packages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  description   text,
  price         numeric(10,2) NOT NULL DEFAULT 0,
  interval_days int         NOT NULL DEFAULT 7,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Composição do pacote (produtos e serviços)
CREATE TABLE IF NOT EXISTS package_items (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  uuid    NOT NULL REFERENCES catalog_packages(id) ON DELETE CASCADE,
  item_type   text    NOT NULL CHECK (item_type IN ('product','service')),
  item_id     uuid    NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
  quantity    int     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Contratos ativos de pacotes por pet
CREATE TABLE IF NOT EXISTS patient_active_packages (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid    NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  pet_id      uuid    NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  package_id  uuid    NOT NULL REFERENCES catalog_packages(id) ON DELETE RESTRICT,
  status      text    NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  price_paid  numeric(10,2),
  started_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Sessões individuais de cada contrato
CREATE TABLE IF NOT EXISTS patient_package_sessions (
  id                        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_active_package_id uuid    NOT NULL REFERENCES patient_active_packages(id) ON DELETE CASCADE,
  appointment_id            uuid    REFERENCES appointments(id) ON DELETE SET NULL,
  status                    text    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','used','cancelled')),
  session_number            int     NOT NULL DEFAULT 1,
  scheduled_for             date,
  used_at                   timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_catalog_packages_clinic   ON catalog_packages(clinic_id);
CREATE INDEX IF NOT EXISTS idx_package_items_package     ON package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_pap_clinic                ON patient_active_packages(clinic_id);
CREATE INDEX IF NOT EXISTS idx_pap_pet                   ON patient_active_packages(pet_id);
CREATE INDEX IF NOT EXISTS idx_pps_pap                   ON patient_package_sessions(patient_active_package_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_catalog_packages_updated_at') THEN
    CREATE TRIGGER trg_catalog_packages_updated_at
      BEFORE UPDATE ON catalog_packages
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pap_updated_at') THEN
    CREATE TRIGGER trg_pap_updated_at
      BEFORE UPDATE ON patient_active_packages
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pps_updated_at') THEN
    CREATE TRIGGER trg_pps_updated_at
      BEFORE UPDATE ON patient_package_sessions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- RLS
ALTER TABLE catalog_packages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_active_packages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_package_sessions ENABLE ROW LEVEL SECURITY;

-- catalog_packages: acesso pela clinic_id do profile
CREATE POLICY "clinic_packages_select" ON catalog_packages
  FOR SELECT USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );
CREATE POLICY "clinic_packages_insert" ON catalog_packages
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );
CREATE POLICY "clinic_packages_update" ON catalog_packages
  FOR UPDATE USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );
CREATE POLICY "clinic_packages_delete" ON catalog_packages
  FOR DELETE USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- package_items: acesso via join com catalog_packages
CREATE POLICY "pkg_items_select" ON package_items
  FOR SELECT USING (
    package_id IN (
      SELECT id FROM catalog_packages
      WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    )
  );
CREATE POLICY "pkg_items_insert" ON package_items
  FOR INSERT WITH CHECK (
    package_id IN (
      SELECT id FROM catalog_packages
      WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    )
  );
CREATE POLICY "pkg_items_update" ON package_items
  FOR UPDATE USING (
    package_id IN (
      SELECT id FROM catalog_packages
      WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    )
  );
CREATE POLICY "pkg_items_delete" ON package_items
  FOR DELETE USING (
    package_id IN (
      SELECT id FROM catalog_packages
      WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    )
  );

-- patient_active_packages: clinic_id direto
CREATE POLICY "pap_select" ON patient_active_packages
  FOR SELECT USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );
CREATE POLICY "pap_insert" ON patient_active_packages
  FOR INSERT WITH CHECK (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );
CREATE POLICY "pap_update" ON patient_active_packages
  FOR UPDATE USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
  );

-- patient_package_sessions: acesso via join com patient_active_packages
CREATE POLICY "pps_select" ON patient_package_sessions
  FOR SELECT USING (
    patient_active_package_id IN (
      SELECT id FROM patient_active_packages
      WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    )
  );
CREATE POLICY "pps_insert" ON patient_package_sessions
  FOR INSERT WITH CHECK (
    patient_active_package_id IN (
      SELECT id FROM patient_active_packages
      WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    )
  );
CREATE POLICY "pps_update" ON patient_package_sessions
  FOR UPDATE USING (
    patient_active_package_id IN (
      SELECT id FROM patient_active_packages
      WHERE clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    )
  );
