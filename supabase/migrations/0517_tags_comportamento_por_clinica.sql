-- 0517 — Tags de comportamento criadas pela própria clínica.
--
-- A lista de tags (Agressivo, Morde, Dócil…) era fixa no código. Cada clínica
-- tem o seu vocabulário — "Precisa de focinheira", "Só com a tutora",
-- "Diabético" — e hoje o que não está na lista simplesmente não existe.
--
-- Fica na própria tabela `clinics` como JSONB porque é uma lista pequena,
-- lida junto com o resto da configuração e nunca consultada por tag.
-- Formato: [{"label": "Precisa de focinheira", "color": "orange"}, …]

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS behavior_tags JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN clinics.behavior_tags IS
  'Tags de comportamento próprias da clínica, além das padrão do sistema. [{label, color}]';
