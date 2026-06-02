-- =============================================================================
-- VetMax — Migration 0216: fluxo simplificado de microchipagem
--
-- Contexto (Item 4, sprint 2026-06-02):
--   A clínica realiza microchipagens avulsas. Forçar prontuário completo gera
--   fricção. Introduzimos visit_reason='microchipping' que, no consultório,
--   renderiza apenas um form com 4 campos (chip number, fabricante, lote,
--   vencimento). Ao salvar: grava microchip_records, atualiza patients.microchip_id,
--   lança serviço no caixa e fecha a consulta.
--
--   Quando o pet tem convênio, o split copay/repass do Item 5 entra
--   automaticamente — não precisamos de lógica especial aqui.
--
-- O que muda:
--   1. CHECK constraint de consultations.visit_reason ganha 'microchipping'.
--   2. Nova tabela microchip_records (clinic+pet+chip details, com FKs e RLS).
-- =============================================================================

BEGIN;

-- ─── 1. visit_reason: adiciona 'microchipping' ───────────────────────────────
-- A constraint original (0002) usou syntax inline na ADD COLUMN sem nome
-- explícito. Pegamos o nome auto-gerado e dropamos antes de recriar.
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'consultations'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%visit_reason%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE consultations DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE consultations
  ADD CONSTRAINT consultations_visit_reason_check
  CHECK (visit_reason IS NULL OR visit_reason IN (
    'consultation',
    'follow_up',
    'emergency',
    'vaccination',
    'exam',
    'surgery',
    'microchipping'    -- Item 4 (2026-06-02): fluxo avulso
  ));

-- ─── 2. microchip_records ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS microchip_records (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID         NOT NULL REFERENCES clinics(id)       ON DELETE CASCADE,
  patient_id      UUID         NOT NULL REFERENCES patients(id)      ON DELETE CASCADE,
  consultation_id UUID         REFERENCES consultations(id)          ON DELETE SET NULL,

  -- Os 4 campos pedidos pelo PO. Todos opcionais — recepcionista pode salvar
  -- com chip sem fabricante (importações antigas) e completar depois.
  chip_number     TEXT,
  manufacturer    TEXT,
  batch_number    TEXT,
  expiry_date     DATE,

  -- Auditoria
  implanted_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  implanted_by    UUID         REFERENCES profiles(id)               ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Histórico por pet (alguns pets podem trocar de chip — ex: chip ilegível).
-- NÃO criamos UNIQUE em (clinic_id, patient_id) — permitimos múltiplos registros.
-- O campo patients.microchip_id continua sendo o "chip ativo" (último gravado).
CREATE INDEX IF NOT EXISTS idx_microchip_records_clinic
  ON microchip_records (clinic_id);

CREATE INDEX IF NOT EXISTS idx_microchip_records_patient
  ON microchip_records (clinic_id, patient_id, implanted_at DESC);

-- Busca por número (rara mas útil em conferências/auditoria)
CREATE INDEX IF NOT EXISTS idx_microchip_records_chip_number
  ON microchip_records (clinic_id, chip_number)
  WHERE chip_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_microchip_records_consultation
  ON microchip_records (consultation_id)
  WHERE consultation_id IS NOT NULL;

-- ─── 3. RLS — isolamento por clinic_id (mesmo padrão das outras tabelas) ─────
ALTER TABLE microchip_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_microchip_records" ON microchip_records;
CREATE POLICY "clinic_isolation_microchip_records"
  ON microchip_records FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

GRANT ALL    ON microchip_records TO service_role;
GRANT SELECT, INSERT, UPDATE ON microchip_records TO authenticated;

COMMENT ON TABLE microchip_records IS
  'Histórico de microchipagens por pet. patients.microchip_id mantém o chip ATIVO (último); microchip_records guarda o histórico completo com fabricante/lote/validade.';

COMMIT;
