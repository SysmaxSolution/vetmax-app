-- Sprint Caixa Didático (2026-06-12)
-- 1. Verificação de saídas pelo admin (Total Verificado = entradas E saídas conferidas)
-- 2. Conferência cega no fechamento de sessão (contado vs esperado + divergência)

-- ── cashier_outflows: verificação ────────────────────────────────────────────
ALTER TABLE cashier_outflows ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE cashier_outflows ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES profiles(id);

-- ── cashier_sessions: conferência cega no fechamento ─────────────────────────
-- counted_total: total contado fisicamente pelo operador (às cegas)
-- counted_by_method: detalhe contado por forma de pagamento { cash: 120.5, pix: 300, ... }
-- difference: contado − esperado (quebra de caixa quando negativo)
-- closing_notes: justificativa da divergência
ALTER TABLE cashier_sessions ADD COLUMN IF NOT EXISTS counted_total numeric(12,2);
ALTER TABLE cashier_sessions ADD COLUMN IF NOT EXISTS counted_by_method jsonb;
ALTER TABLE cashier_sessions ADD COLUMN IF NOT EXISTS difference numeric(12,2);
ALTER TABLE cashier_sessions ADD COLUMN IF NOT EXISTS closing_notes text;

-- Índice para histórico de fechamentos por clínica (consulta da aba Sessão)
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_clinic_closed
  ON cashier_sessions (clinic_id, closed_at DESC)
  WHERE status = 'closed';
