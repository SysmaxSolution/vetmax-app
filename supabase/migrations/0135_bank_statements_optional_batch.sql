-- Torna import_batch_id opcional para permitir lançamentos gerados
-- automaticamente por baixa/estorno de títulos financeiros
ALTER TABLE bank_statements ALTER COLUMN import_batch_id DROP NOT NULL;
