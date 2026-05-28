-- =============================================================================
-- VetMax — Migration 0200: Conta da Internação + Diárias (Regra 4)
--
-- Conta de faturamento da internação: itens de medicação aplicada, kits (Fase 3),
-- diárias do leito/box e itens manuais (procedimentos/exames). Base da máquina de
-- estado de alta: Alta Administrativa só com a conta liquidada/transferida.
--
-- Conteúdo:
--   1. hospitalization_charges — linhas de custo da internação.
--   2. ALTER rooms ADD daily_rate — valor da diária do box/leito.
--   3. rpc_accrue_hospitalization_dailies() — lança 1 diária/dia por internação
--      ATIVA (status observation/ward/icu; ready_for_discharge NÃO acumula).
-- =============================================================================

BEGIN;

-- ─── 1. hospitalization_charges ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hospitalization_charges (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          UUID          NOT NULL REFERENCES clinics(id)          ON DELETE CASCADE,
  hospitalization_id UUID          NOT NULL REFERENCES hospitalizations(id) ON DELETE CASCADE,
  kind               TEXT          NOT NULL CHECK (kind IN ('daily','medication','kit','procedure','exam','other')),
  description        TEXT          NOT NULL,
  quantity           NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount             NUMERIC(12,2) NOT NULL DEFAULT 0,   -- total da linha
  -- open = em aberto; transferred = lançado no PDV/caixa; paid = liquidado aqui;
  -- void = cancelado. Saldo da internação = SUM(amount) WHERE status='open'.
  status             TEXT          NOT NULL DEFAULT 'open' CHECK (status IN ('open','transferred','paid','void')),
  source_ref         UUID,         -- origem (ex.: hospitalization_dose_administrations.id) — dedup
  charged_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_by         UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hosp_charges_hosp   ON hospitalization_charges (hospitalization_id, status);
CREATE INDEX IF NOT EXISTS idx_hosp_charges_clinic ON hospitalization_charges (clinic_id);

ALTER TABLE hospitalization_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_hosp_charges" ON hospitalization_charges;
CREATE POLICY "clinic_isolation_hosp_charges"
  ON hospitalization_charges FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE hospitalization_charges IS
  'Conta da internação (Regra 4). Saldo = SUM(amount) WHERE status=open. Alta Administrativa só com saldo zerado (tudo transferred/paid/void).';

-- ─── 2. rooms.daily_rate ─────────────────────────────────────────────────────

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN rooms.daily_rate IS 'Valor da diária do leito/box (Internação Completa). 0 = não cobra diária.';

-- ─── 3. Acúmulo automático de diárias ────────────────────────────────────────
-- Lança 1 diária por dia (UTC) por internação ATIVA. ready_for_discharge e
-- discharged NÃO acumulam (Regra 4: a Alta Médica cessa o acúmulo). Idempotente:
-- não duplica a diária do dia corrente.

CREATE OR REPLACE FUNCTION public.rpc_accrue_hospitalization_dailies(
  p_hospitalization_id UUID DEFAULT NULL   -- NULL = todas as internações ativas (cron)
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER := 0;
  r       RECORD;
  v_rate  NUMERIC;
BEGIN
  FOR r IN
    SELECT h.id, h.clinic_id, h.box_id
    FROM hospitalizations h
    WHERE h.status IN ('observation','ward','icu')
      AND (p_hospitalization_id IS NULL OR h.id = p_hospitalization_id)
  LOOP
    v_rate := COALESCE((SELECT daily_rate FROM rooms WHERE id = r.box_id), 0);
    IF v_rate <= 0 THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM hospitalization_charges c
      WHERE c.hospitalization_id = r.id
        AND c.kind = 'daily'
        AND c.status <> 'void'
        AND (c.charged_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO hospitalization_charges
      (clinic_id, hospitalization_id, kind, description, quantity, unit_amount, amount, status)
    VALUES
      (r.clinic_id, r.id, 'daily', 'Diária de internação', 1, v_rate, v_rate, 'open');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.rpc_accrue_hospitalization_dailies IS
  'Lança a diária do dia (1×/dia/internação ativa). p_hospitalization_id NULL = todas (cron). ready_for_discharge/discharged não acumulam (Regra 4).';

GRANT EXECUTE ON FUNCTION public.rpc_accrue_hospitalization_dailies TO authenticated;

COMMIT;
