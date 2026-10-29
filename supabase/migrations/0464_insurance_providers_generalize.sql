-- 0464 — Generaliza o cadastro de convênios para servir Petlove/Vetplan/AVA/outros.
-- receipt_mode classifica COMO a clínica recebe; config guarda ajustes flexíveis
-- (ex.: siglas de plano do Vetplan, regra do valor intermediário da AVA, etc.).
ALTER TABLE insurance_providers
  ADD COLUMN IF NOT EXISTS receipt_mode TEXT NOT NULL DEFAULT 'convenio_repasse',
  ADD COLUMN IF NOT EXISTS config       JSONB NOT NULL DEFAULT '{}'::jsonb;

-- receipt_mode:
--   'convenio_repasse' → a clínica cobra do CONVÊNIO (tutor R$ 0); concilia repasse
--                        + emite NFS-e ao convênio (Petlove, Vetplan, AVA "PAGA").
--   'ong_guia'         → ONG com guia carimbada: "PAGA" (cobra da ONG) ou
--                        "ENCAMINHADA" (tutor paga valor intermediário). (AVA)
--   'particular_desconto' → tutor paga com tabela/desconto próprio, sem repasse.
COMMENT ON COLUMN insurance_providers.receipt_mode IS 'convenio_repasse | ong_guia | particular_desconto';
