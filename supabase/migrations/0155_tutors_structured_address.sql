-- Migration 0155: Campos de endereço estruturado no tutor
-- Mantém 'address' existente para compatibilidade; adiciona campos separados

ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS cep              TEXT,
  ADD COLUMN IF NOT EXISTS street           TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood     TEXT,
  ADD COLUMN IF NOT EXISTS city             TEXT,
  ADD COLUMN IF NOT EXISTS state            TEXT,
  ADD COLUMN IF NOT EXISTS address_number   TEXT,
  ADD COLUMN IF NOT EXISTS address_complement TEXT;
