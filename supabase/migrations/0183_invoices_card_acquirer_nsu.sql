-- =============================================================================
-- VetMax — Migration 0183: invoices · dados de cartão para conciliação
--
-- Quando o pagamento é em cartão de crédito/débito, a recepção precisa
-- registrar os dados que permitem conciliar com a maquininha:
--   - card_acquirer       : administradora (Cielo, Stone, Rede, GetNet, ...)
--   - card_nsu            : NSU emitido pela maquininha
--   - card_authorization  : número de liberação (autorização)
-- =============================================================================

BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS card_acquirer      TEXT NULL,
  ADD COLUMN IF NOT EXISTS card_nsu           TEXT NULL,
  ADD COLUMN IF NOT EXISTS card_authorization TEXT NULL;

COMMENT ON COLUMN invoices.card_acquirer      IS 'Administradora do cartão (Cielo, Stone, Rede, GetNet, ...).';
COMMENT ON COLUMN invoices.card_nsu           IS 'NSU da operação na maquininha.';
COMMENT ON COLUMN invoices.card_authorization IS 'Número de autorização/liberação emitido pela bandeira.';

CREATE INDEX IF NOT EXISTS idx_invoices_card_nsu
  ON invoices (clinic_id, card_nsu)
  WHERE card_nsu IS NOT NULL;

COMMIT;
