-- Migration 0067: Microchip ID em Pets
-- Nota: allergies e chronic_diseases já existem na tabela patients (adicionados em migrations anteriores).
-- Esta migration adiciona apenas microchip_id.
-- Reversível: ALTER TABLE patients DROP COLUMN IF EXISTS microchip_id;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS microchip_id VARCHAR(50);

-- Índice para busca por microchip
CREATE INDEX IF NOT EXISTS idx_patients_microchip_id
  ON patients (clinic_id, microchip_id)
  WHERE microchip_id IS NOT NULL;

COMMENT ON COLUMN patients.microchip_id IS 'Código do microchip de identificação (ISO 11784/11785), 15 dígitos padrão';
