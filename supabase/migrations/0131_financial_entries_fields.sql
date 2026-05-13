-- 0131: Campos faltantes nos títulos financeiros
-- Adiciona: document_number, professional_id, discount, chart_of_accounts_id, interest, settlement_bank_id
-- Cria trigger de preenchimento automático de número sequencial

BEGIN;

-- ── 1. Novos campos ────────────────────────────────────────────────────────────

ALTER TABLE financial_entries
  ADD COLUMN IF NOT EXISTS document_number      VARCHAR(30),
  ADD COLUMN IF NOT EXISTS professional_id      UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS discount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chart_of_accounts_id UUID REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS interest             NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_bank_id   UUID REFERENCES bank_accounts(id);

-- ── 2. Índices ─────────────────────────────────────────────────────────────────

-- Único por clínica (ignora NULLs para registros legados sem número)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_fe_doc_number
  ON financial_entries(clinic_id, document_number)
  WHERE document_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fe_professional  ON financial_entries(professional_id);
CREATE INDEX IF NOT EXISTS idx_fe_chart_acc     ON financial_entries(chart_of_accounts_id);
CREATE INDEX IF NOT EXISTS idx_fe_settle_bank   ON financial_entries(settlement_bank_id);

-- ── 3. Gerador de número sequencial ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_generate_doc_number(p_clinic_id UUID, p_type TEXT)
RETURNS VARCHAR AS $$
DECLARE
  v_year   INT  := EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo');
  v_prefix TEXT := CASE WHEN p_type = 'receivable' THEN 'REC' ELSE 'PAG' END;
  v_seq    INT;
  v_key    BIGINT;
BEGIN
  -- Advisory lock por clínica+tipo+ano para serializar inserções concorrentes
  v_key := ('x' || substr(md5(p_clinic_id::TEXT || p_type || v_year::TEXT), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_key);

  SELECT COALESCE(
    MAX(
      CASE
        WHEN document_number ~ ('^' || v_prefix || '-' || v_year::TEXT || '-[0-9]+$')
        THEN CAST(SPLIT_PART(document_number, '-', 3) AS INT)
        ELSE 0
      END
    ),
    0
  ) + 1 INTO v_seq
  FROM financial_entries
  WHERE clinic_id = p_clinic_id
    AND type = p_type;

  RETURN v_prefix || '-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ── 4. Trigger: preenche defaults no INSERT ────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_fn_fe_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.document_number IS NULL THEN
    NEW.document_number := fn_generate_doc_number(NEW.clinic_id, NEW.type);
  END IF;
  -- Profissional padrão = quem criou o título
  IF NEW.professional_id IS NULL AND NEW.created_by IS NOT NULL THEN
    NEW.professional_id := NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fe_defaults ON financial_entries;
CREATE TRIGGER trg_fe_defaults
  BEFORE INSERT ON financial_entries
  FOR EACH ROW EXECUTE FUNCTION trg_fn_fe_defaults();

-- ── 5. RLS: novas colunas herdam as políticas existentes automaticamente ───────
-- (Nenhuma alteração necessária — RLS opera por linha, não por coluna)

COMMIT;
