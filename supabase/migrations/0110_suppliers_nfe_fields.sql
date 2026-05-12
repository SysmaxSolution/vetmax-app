-- Extensão da tabela suppliers para campos NF-e / fiscal
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ie                  TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city                TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS state               CHAR(2);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS zip_code            TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address_number      TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address_complement  TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website             TEXT;
