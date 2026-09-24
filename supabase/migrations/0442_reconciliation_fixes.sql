-- 0442 — Pontas de reconciliação (auditoria 2026-09-05).
-- Marca movimentos internos (transferência inter-CNPJ por uso de crédito) para
-- serem ELIMINADOS das somas consolidadas de receita/despesa — não são dinheiro
-- novo do grupo, só realocação entre empresas faturantes. Aditiva + idempotente.

ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS is_intercompany boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN financial_entries.is_intercompany IS 'Movimento interno entre empresas faturantes (uso de crédito inter-CNPJ). Excluído de receita/despesa consolidada; visível só na conciliação por conta/CNPJ.';
