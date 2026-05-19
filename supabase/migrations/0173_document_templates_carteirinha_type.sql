-- =============================================================================
-- VetMax — Migration 0173: tipo 'carteirinha' em document_templates
--
-- Estende o CHECK do type pra incluir carteirinha (carteira de vacinação
-- digital, compartilhável via link público para o tutor).
--
-- Estratégia aditiva: drop + recreate do CHECK preservando todos os
-- tipos anteriores. Idempotente via IF EXISTS no DROP.
-- =============================================================================

ALTER TABLE document_templates
  DROP CONSTRAINT IF EXISTS document_templates_type_check;

ALTER TABLE document_templates
  ADD CONSTRAINT document_templates_type_check
  CHECK (type IN (
    'laudo', 'receita', 'encaminhamento', 'termo',
    'exame', 'carteirinha', 'outro'
  ));
