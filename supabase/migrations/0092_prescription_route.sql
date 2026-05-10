-- Migration 0092: Via de administração em prescrições (C-01)
-- Permite agrupar prescrições por rota de administração na interface do MV.

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS route_of_administration text NOT NULL DEFAULT 'oral'
    CHECK (route_of_administration IN ('oral','iv','im','subcutaneo','topico','inalacao','outro'));
