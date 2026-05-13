-- Adiciona saldo inicial configurável por conta bancária
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS initial_balance NUMERIC(14, 2) NOT NULL DEFAULT 0;
