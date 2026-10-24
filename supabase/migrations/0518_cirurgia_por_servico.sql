-- 0518 — Checklist pré-operatório e kit cirúrgico definidos POR SERVIÇO.
--
-- O checklist da cirurgia era sempre o mesmo (jejum, exames, termo) e o kit
-- era escolhido à mão na ficha, de uma lista com todos os kits da clínica.
-- Uma castração e uma osteossíntese não exigem a mesma preparação nem usam
-- o mesmo material — e quem monta a ficha não deveria ter que lembrar disso.
--
-- O serviço (stock_items.is_service) passa a carregar os dois: a lista de
-- checagens que a cirurgia dele exige e o kit que ela consome por padrão.
-- A cirurgia guarda de qual serviço nasceu, para a ficha buscar os dois.

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS preop_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_kit_id  UUID  REFERENCES service_kits(id) ON DELETE SET NULL;

ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES stock_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surgeries_service ON surgeries (service_id) WHERE service_id IS NOT NULL;

COMMENT ON COLUMN stock_items.preop_checklist IS
  'Checagens pré-operatórias exigidas por este serviço cirúrgico. ["Tricotomia feita", "Acesso venoso", …]';
COMMENT ON COLUMN stock_items.default_kit_id IS
  'Kit cirúrgico que este serviço consome por padrão (service_kits). A ficha sugere e aplica com um clique.';
COMMENT ON COLUMN surgeries.service_id IS
  'Serviço do catálogo que originou a cirurgia — de onde vêm o checklist e o kit padrão.';
