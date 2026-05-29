-- =============================================================================
-- VetMax — Migration 0206: Diária Variável por Categoria de Internação
--
-- Permite tarifa de diária por (categoria, espécie, porte) em vez de um valor
-- fixo por leito. Mantém compatibilidade: na ausência de tarifa cadastrada,
-- usa rooms.daily_rate (comportamento da 0200).
--
-- Conteúdo:
--   1. hospitalizations.care_level + animal_size (categoria e porte).
--   2. rooms.default_care_level (pré-fill na admissão a partir do box).
--   3. hospitalization_daily_rates — catálogo de tarifas.
--   4. Reescrita do rpc_accrue_hospitalization_dailies com resolução em cascata.
-- =============================================================================

BEGIN;

-- ─── 1. Categoria + porte na internação ─────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='hospitalizations' AND column_name='care_level'
  ) THEN
    ALTER TABLE hospitalizations
      ADD COLUMN care_level TEXT
      CHECK (care_level IN ('enfermaria','semi_intensiva','uti','isolamento'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='hospitalizations' AND column_name='animal_size'
  ) THEN
    ALTER TABLE hospitalizations
      ADD COLUMN animal_size TEXT
      CHECK (animal_size IN ('small','medium','large'));
  END IF;
END $$;

COMMENT ON COLUMN hospitalizations.care_level IS
  'Categoria do cuidado (enfermaria/semi_intensiva/uti/isolamento). Define a tarifa da diária via hospitalization_daily_rates.';
COMMENT ON COLUMN hospitalizations.animal_size IS
  'Porte clínico do animal nesta internação (small/medium/large). Refinador opcional da tarifa.';

-- ─── 2. Categoria padrão por sala (pré-fill na admissão) ─────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='rooms' AND column_name='default_care_level'
  ) THEN
    ALTER TABLE rooms
      ADD COLUMN default_care_level TEXT
      CHECK (default_care_level IN ('enfermaria','semi_intensiva','uti','isolamento'));
  END IF;
END $$;

COMMENT ON COLUMN rooms.default_care_level IS
  'Categoria padrão sugerida ao admitir um pet neste box (ex.: box de UTI → "uti"). Apenas pré-fill; o vet pode mudar na admissão.';

-- ─── 3. Catálogo de tarifas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hospitalization_daily_rates (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID          NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  category    TEXT          NOT NULL CHECK (category IN ('enfermaria','semi_intensiva','uti','isolamento')),
  -- species/size NULL = aplica a qualquer valor (curinga). A resolução tenta o
  -- mais específico primeiro e degrada para curinga.
  species     TEXT          NULL,
  size        TEXT          NULL CHECK (size IS NULL OR size IN ('small','medium','large')),
  rate        NUMERIC(12,2) NOT NULL CHECK (rate >= 0),
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hosp_daily_rates_lookup
  ON hospitalization_daily_rates (clinic_id, category, active);

ALTER TABLE hospitalization_daily_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_daily_rates" ON hospitalization_daily_rates;
CREATE POLICY "clinic_isolation_daily_rates"
  ON hospitalization_daily_rates FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMENT ON TABLE hospitalization_daily_rates IS
  'Catálogo de diárias por (categoria, espécie, porte). NULL em species/size = curinga. Resolução em cascata no rpc_accrue_hospitalization_dailies.';

-- ─── 4. RPC com resolução em cascata ────────────────────────────────────────
-- Ordem de busca (do mais específico ao mais geral):
--   (care_level, species, size) → (care_level, species, *) →
--   (care_level, *, size) → (care_level, *, *) → rooms.daily_rate.

CREATE OR REPLACE FUNCTION public.rpc_accrue_hospitalization_dailies(
  p_hospitalization_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count    INTEGER := 0;
  r          RECORD;
  v_rate     NUMERIC;
  v_species  TEXT;
  v_desc     TEXT;
BEGIN
  FOR r IN
    SELECT h.id, h.clinic_id, h.box_id, h.care_level, h.animal_size, h.patient_id
    FROM hospitalizations h
    WHERE h.status IN ('observation','ward','icu')
      AND (p_hospitalization_id IS NULL OR h.id = p_hospitalization_id)
  LOOP
    v_rate := NULL;
    v_species := NULL;

    SELECT species INTO v_species FROM patients WHERE id = r.patient_id;

    IF r.care_level IS NOT NULL THEN
      -- (categoria, espécie, porte)
      SELECT rate INTO v_rate FROM hospitalization_daily_rates
       WHERE clinic_id = r.clinic_id AND active
         AND category = r.care_level
         AND species  = v_species
         AND size     = r.animal_size
       ORDER BY created_at DESC LIMIT 1;

      -- (categoria, espécie, *)
      IF v_rate IS NULL THEN
        SELECT rate INTO v_rate FROM hospitalization_daily_rates
         WHERE clinic_id = r.clinic_id AND active
           AND category = r.care_level
           AND species  = v_species
           AND size     IS NULL
         ORDER BY created_at DESC LIMIT 1;
      END IF;

      -- (categoria, *, porte)
      IF v_rate IS NULL THEN
        SELECT rate INTO v_rate FROM hospitalization_daily_rates
         WHERE clinic_id = r.clinic_id AND active
           AND category = r.care_level
           AND species  IS NULL
           AND size     = r.animal_size
         ORDER BY created_at DESC LIMIT 1;
      END IF;

      -- (categoria, *, *)
      IF v_rate IS NULL THEN
        SELECT rate INTO v_rate FROM hospitalization_daily_rates
         WHERE clinic_id = r.clinic_id AND active
           AND category = r.care_level
           AND species  IS NULL
           AND size     IS NULL
         ORDER BY created_at DESC LIMIT 1;
      END IF;
    END IF;

    -- Fallback: tarifa fixa do box (0200).
    IF v_rate IS NULL THEN
      v_rate := COALESCE((SELECT daily_rate FROM rooms WHERE id = r.box_id), 0);
    END IF;

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

    v_desc := 'Diária ' || COALESCE(NULLIF(r.care_level, ''), 'padrão');

    INSERT INTO hospitalization_charges
      (clinic_id, hospitalization_id, kind, description, quantity, unit_amount, amount, status)
    VALUES
      (r.clinic_id, r.id, 'daily', v_desc, 1, v_rate, v_rate, 'open');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.rpc_accrue_hospitalization_dailies IS
  'Lança a diária do dia (1×/dia/internação ativa) com resolução em cascata por (care_level, species, animal_size) em hospitalization_daily_rates. Fallback: rooms.daily_rate. ready_for_discharge/discharged não acumulam.';

GRANT EXECUTE ON FUNCTION public.rpc_accrue_hospitalization_dailies TO authenticated;

COMMIT;
