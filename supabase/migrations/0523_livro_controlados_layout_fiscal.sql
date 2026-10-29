-- 0523 — Livro de Controlados no layout fiscal (Portaria SVS/MS 344/1998 —
--        Livro de Registro Específico, uma folha por substância).
--
-- A planilha que a clínica envia à Vigilância tem, em cada linha do livro:
--   DATA | HISTÓRICO (Pet-Responsável, Procedimento, Nº OS) | MOVIMENTO
--   (Entrada, Saída, Perdas) | ESTOQUE | ASSINATURA DO RESP. TÉCNICO | OBSERVAÇÕES
--
-- O movimento de estoque guardava só `notes` e `reference_id`. Para o livro
-- sair igual sem adivinhar nada na hora do relatório, cada movimento passa a
-- carregar o seu HISTÓRICO como fotografia do momento (snapshot): o nome do
-- pet, do tutor e do procedimento como eram quando a saída aconteceu. Livro é
-- registro legal — não pode mudar porque alguém renomeou um cadastro depois.
--
-- Aditiva e idempotente. `loss_reason` já veio na 0507; repetida aqui com
-- IF NOT EXISTS para a migration valer sozinha.

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS os_number       TEXT,   -- nº da OS / atendimento (saídas)
  ADD COLUMN IF NOT EXISTS patient_name    TEXT,   -- pet (saídas)
  ADD COLUMN IF NOT EXISTS tutor_name      TEXT,   -- responsável pelo pet (saídas)
  ADD COLUMN IF NOT EXISTS procedure_name  TEXT,   -- serviço / procedimento / "aplicação"
  ADD COLUMN IF NOT EXISTS counterparty    TEXT,   -- fornecedor (entradas) ou destinatário
  ADD COLUMN IF NOT EXISTS document_number TEXT,   -- NF-e da entrada, notificação de receita da saída
  ADD COLUMN IF NOT EXISTS batch_number    TEXT,   -- lote(s) tocado(s) pelo movimento
  ADD COLUMN IF NOT EXISTS expires_at      DATE,   -- validade do lote (entradas)
  ADD COLUMN IF NOT EXISTS loss_reason     TEXT;   -- motivo da perda/inutilização

COMMENT ON COLUMN stock_movements.os_number       IS 'Livro de Controlados: nº da OS da saída (snapshot).';
COMMENT ON COLUMN stock_movements.patient_name    IS 'Livro de Controlados: pet da saída (snapshot do nome).';
COMMENT ON COLUMN stock_movements.tutor_name      IS 'Livro de Controlados: responsável pelo pet (snapshot do nome).';
COMMENT ON COLUMN stock_movements.procedure_name  IS 'Livro de Controlados: procedimento/serviço em que o item foi usado.';
COMMENT ON COLUMN stock_movements.counterparty    IS 'Livro de Controlados: fornecedor da entrada (razão social) ou destinatário.';
COMMENT ON COLUMN stock_movements.document_number IS 'Livro de Controlados: nº da NF-e (entrada) ou da notificação de receita (saída).';
COMMENT ON COLUMN stock_movements.batch_number    IS 'Livro de Controlados: lote(s) do movimento; vários separados por " / ".';
COMMENT ON COLUMN stock_movements.expires_at      IS 'Livro de Controlados: validade do lote que entrou.';

-- Consulta do livro: por item, em ordem cronológica, dentro da clínica.
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_created
  ON stock_movements (clinic_id, stock_item_id, created_at);

-- Responsável técnico assina cada folha do livro. Fica na clínica (um RT por
-- estabelecimento/CNPJ), editável em Relatórios → Livro de Controlados.
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS technical_responsible_name TEXT,
  ADD COLUMN IF NOT EXISTS technical_responsible_crmv TEXT;

COMMENT ON COLUMN clinics.technical_responsible_name IS 'Responsável técnico (MV) que assina o Livro de Controlados.';
COMMENT ON COLUMN clinics.technical_responsible_crmv IS 'CRMV do responsável técnico, com UF (ex.: CRMV-SP 12345).';
