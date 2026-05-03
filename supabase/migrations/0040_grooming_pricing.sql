-- ─── Migration 0040: Faturamento e Agendamento do Módulo Banho e Tosa ─────────

-- 1. Campos de precificação em grooming_sessions
ALTER TABLE grooming_sessions
  ADD COLUMN IF NOT EXISTS price_total       NUMERIC(10,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS service_prices    JSONB          DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discount_percent  INTEGER        DEFAULT 0
    CONSTRAINT grooming_discount_range CHECK (discount_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS payment_status    TEXT           DEFAULT 'pending'
    CONSTRAINT grooming_payment_status_check CHECK (payment_status IN ('pending', 'paid', 'waived'));

-- 2. Estender clinic_catalog para suportar serviços de grooming
ALTER TABLE clinic_catalog
  DROP CONSTRAINT IF EXISTS clinic_catalog_item_type_check;

ALTER TABLE clinic_catalog
  ADD CONSTRAINT clinic_catalog_item_type_check
  CHECK (item_type IN ('consultation', 'medication', 'exam', 'other', 'grooming'));

-- 3. Índice para busca rápida de itens de grooming por clínica
CREATE INDEX IF NOT EXISTS idx_catalog_grooming
  ON clinic_catalog (clinic_id, item_type)
  WHERE item_type = 'grooming' AND is_active = true;

-- 4. Índice para sessões agendadas (scheduled_at futuro)
CREATE INDEX IF NOT EXISTS idx_grooming_scheduled
  ON grooming_sessions (clinic_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- 5. Índice para controle de pagamento
CREATE INDEX IF NOT EXISTS idx_grooming_payment
  ON grooming_sessions (clinic_id, payment_status)
  WHERE payment_status = 'pending';
