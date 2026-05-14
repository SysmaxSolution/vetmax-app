-- Fase 5: total_sessions e profissional padrão em catalog_packages
ALTER TABLE catalog_packages
  ADD COLUMN IF NOT EXISTS total_sessions        int  NOT NULL DEFAULT 1 CHECK (total_sessions > 0),
  ADD COLUMN IF NOT EXISTS default_professional_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
