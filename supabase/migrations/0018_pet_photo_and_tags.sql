-- Sprint: Smart Prescription & Pet Tags
-- Adiciona foto de perfil e tags comportamentais ao cadastro do pet

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS behavior_tags JSONB DEFAULT '[]'::jsonb;

-- Índice para queries que filtram por tags
CREATE INDEX IF NOT EXISTS idx_patients_behavior_tags
  ON patients USING gin(behavior_tags);
