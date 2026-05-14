-- Migration 0142: Adiciona categorias específicas de serviço à constraint de category
-- Novos tipos: vet_service, grooming_service, aesthetics_service, surgery

ALTER TABLE stock_items
  DROP CONSTRAINT IF EXISTS stock_items_category_check;

ALTER TABLE stock_items
  ADD CONSTRAINT stock_items_category_check
  CHECK (category IN (
    -- Produtos
    'medication',
    'controlled_medication',
    'clinic_product',
    'petshop',
    'grooming_supply',
    'aesthetics',
    'other',
    -- Serviços (legado/genérico)
    'service',
    'exam',
    -- Serviços (tipos específicos)
    'vet_service',
    'grooming_service',
    'aesthetics_service',
    'surgery'
  ));
