-- Migration 0096: Flag de data de nascimento estimada (P-01)
-- Indica que birth_date foi calculado por idade informada, não por data exata.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS birth_date_estimated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN patients.birth_date_estimated IS
  'true quando a data de nascimento foi estimada a partir de idade informada (ex: "3 anos"), false quando data exata foi fornecida';
