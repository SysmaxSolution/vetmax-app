-- =============================================================================
-- VetMax — Migration 0187: vincula prescrição de internação ao estoque
-- Épico 2.4 — Baixa Automática de Estoque (integração com Bloco 4).
--
-- Adiciona stock_item_id + quantity_per_dose em hospitalization_prescriptions.
-- Quando o vet preencher esses campos no cadastro da prescrição, cada
-- aplicação de dose (Bloco 4) dispara automaticamente
-- rpc_apply_stock_consumption — fechando o ciclo de auditoria farmacêutica.
-- =============================================================================

BEGIN;

ALTER TABLE hospitalization_prescriptions
  ADD COLUMN IF NOT EXISTS stock_item_id     UUID
    REFERENCES stock_items(id) ON DELETE SET NULL;

ALTER TABLE hospitalization_prescriptions
  ADD COLUMN IF NOT EXISTS quantity_per_dose NUMERIC(10,3)
    CHECK (quantity_per_dose IS NULL OR quantity_per_dose > 0);

COMMENT ON COLUMN hospitalization_prescriptions.stock_item_id IS
  'Vínculo opcional com stock_items — quando preenchido, applyHospitalizationDose dispara consumeStockForApplication.';

COMMENT ON COLUMN hospitalization_prescriptions.quantity_per_dose IS
  'Quantidade (unidades fracionáveis) consumida do estoque a cada dose aplicada. Ex.: 0.5 frasco, 2 comprimidos.';

CREATE INDEX IF NOT EXISTS idx_hosp_presc_stock_item
  ON hospitalization_prescriptions (stock_item_id)
  WHERE stock_item_id IS NOT NULL;

COMMIT;
