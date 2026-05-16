-- Adiciona campos básicos de cadastro da clínica que estavam sendo referenciados
-- pela API /api/update-clinic e pela page de gestão sem existir na tabela.

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS address    TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
