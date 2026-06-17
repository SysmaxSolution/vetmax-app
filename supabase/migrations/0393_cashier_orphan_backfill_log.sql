-- 0393 — Trilha de auditoria do backfill de session_id em sessões FECHADAS
--
-- O bug do session_id (corrigido em 0391/0392) deixou lançamentos de sessões
-- já fechadas com session_id NULL. A remediação (Opção B do council) vincula
-- esses órfãos à sessão correta SEM tocar no closing_balance/difference
-- históricos (que são fato atestado pelo operador na conferência cega).
--
-- Esta tabela registra cada vínculo (quem/quando/valores) para reversão
-- cirúrgica por batch_id e auditoria contábil/CFMV.

CREATE TABLE IF NOT EXISTS cashier_orphan_backfill_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          uuid NOT NULL,
  entry_id          uuid NOT NULL,
  clinic_id         uuid NOT NULL,
  old_session_id    uuid,                 -- sempre NULL (eram órfãos); registrado por completude
  new_session_id    uuid NOT NULL,
  amount            numeric(12,2) NOT NULL,
  entry_status      text,
  session_opened_at timestamptz,
  session_closed_at timestamptz,
  run_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orphan_backfill_batch ON cashier_orphan_backfill_log (batch_id);
CREATE INDEX IF NOT EXISTS idx_orphan_backfill_entry ON cashier_orphan_backfill_log (entry_id);

COMMENT ON TABLE cashier_orphan_backfill_log IS
  'Auditoria do backfill de session_id em sessões fechadas (remediação do bug 0391). Não altera closing_balance. Reversível por batch_id.';
