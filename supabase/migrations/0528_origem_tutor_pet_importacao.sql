-- 0528 — Origem do cadastro na importação de tutores e pets.
--
-- A carga do sistema legado (Vertis) precisa ser idempotente: rodar de novo
-- atualiza o que mudou em vez de duplicar o tutor e o pet. `source_code` guarda
-- o código do registro no sistema de origem (ex.: 'VERTIS-20142'), com índice
-- único por clínica — o mesmo padrão já usado em stock_items (0526).
-- Aditiva, idempotente.

BEGIN;

ALTER TABLE tutors   ADD COLUMN IF NOT EXISTS source_code TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS source_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tutors_source_code
  ON tutors (clinic_id, source_code) WHERE source_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_source_code
  ON patients (clinic_id, source_code) WHERE source_code IS NOT NULL;

COMMENT ON COLUMN tutors.source_code IS
  'Código do tutor no sistema de origem da migração (ex.: VERTIS-3021). Torna a reimportação idempotente.';
COMMENT ON COLUMN patients.source_code IS
  'Código do pet no sistema de origem da migração (ex.: VERTIS-20142). Torna a reimportação idempotente.';

COMMIT;
