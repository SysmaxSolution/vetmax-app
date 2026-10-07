-- 0489 — Tabela de referência do laudo, configurável por clínica.
--
-- Por quê: até aqui o laudo imprimia a faixa que o APARELHO manda. A Amanda
-- (Clínica Animais) avisou que não é assim que trabalham:
--
--   • usam faixas PRÓPRIAS, diferentes das do analisador;
--   • há analitos do aparelho que simplesmente não entram no laudo deles;
--   • de MIELÓCITOS a MONÓCITOS o diferencial sai da LÂMINA, no microscópio,
--     e é digitado — o diferencial do aparelho não vale;
--   • a contagem plaquetária às vezes é corrigida à mão depois da lâmina;
--   • há campos que são só texto (observações, avaliação plaquetária,
--     pesquisa de hematozoários com um padrão "Amostra negativa.", nota).
--
-- Nada disso pode ser fixo no código: outra clínica trabalha de outro jeito, e
-- a própria Animais vai querer mudar. Então vira configuração por clínica,
-- por exame e por espécie (referência de cão ≠ de gato).
--
-- Sem conjunto cadastrado, o laudo continua exatamente como está hoje
-- (faixas do aparelho) — nenhuma clínica existente muda de comportamento.

CREATE TABLE IF NOT EXISTS lab_reference_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL,
  -- Qual exame: 'hemograma', 'bioquimico', … (livre, casado pelo painel do HL7)
  panel_key   text NOT NULL,
  -- Espécie a que a faixa se aplica. NULL = serve para qualquer espécie.
  species     text,
  name        text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Um conjunto por clínica/exame/espécie. `species IS NULL` precisa de índice
-- próprio porque NULL não colide com NULL em índice único comum.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_reference_sets_especie
  ON lab_reference_sets (clinic_id, panel_key, species) WHERE species IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_reference_sets_geral
  ON lab_reference_sets (clinic_id, panel_key) WHERE species IS NULL;

CREATE INDEX IF NOT EXISTS idx_lab_reference_sets_clinic
  ON lab_reference_sets (clinic_id, panel_key) WHERE is_active;

CREATE TABLE IF NOT EXISTS lab_reference_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL,
  set_id        uuid NOT NULL REFERENCES lab_reference_sets(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,

  -- Como aparece no laudo ("ERITRÓCITOS", "V.C.M.", "Pesquisa de hematozoários")
  label         text NOT NULL,
  -- Código do analito no aparelho (RBC, WBC, NEU%, CREAT…). NULL em linha de texto.
  analyte_code  text,
  -- Onde a linha entra no laudo.
  section       text NOT NULL DEFAULT 'other'
                CHECK (section IN ('erythrogram','leukogram','platelets','biochem','other')),

  -- De onde vem o valor:
  --   device = o analisador manda
  --   slide  = leitura de lâmina, digitada pelo laboratório (valor do aparelho é ignorado)
  --   text   = campo de texto livre (observações, avaliação, nota)
  input_source  text NOT NULL DEFAULT 'device'
                CHECK (input_source IN ('device','slide','text')),

  unit          text,
  -- Faixa da CLÍNICA. Texto é o que se imprime; low/high servem para marcar H/L.
  ref_text      text,
  ref_low       numeric,
  ref_high      numeric,

  is_visible    boolean NOT NULL DEFAULT true,
  -- Permite corrigir à mão um valor que veio do aparelho (ex.: plaquetas).
  is_editable   boolean NOT NULL DEFAULT false,
  -- Texto que já vem preenchido numa linha 'text' ("Amostra negativa.").
  default_text  text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_reference_items_label
  ON lab_reference_items (set_id, label);
CREATE INDEX IF NOT EXISTS idx_lab_reference_items_set
  ON lab_reference_items (set_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_lab_reference_items_clinic
  ON lab_reference_items (clinic_id);

ALTER TABLE lab_reference_sets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_reference_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='lab_reference_sets'
       AND policyname='lab_reference_sets_tenant'
  ) THEN
    CREATE POLICY lab_reference_sets_tenant ON lab_reference_sets
      FOR ALL
      USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='lab_reference_items'
       AND policyname='lab_reference_items_tenant'
  ) THEN
    CREATE POLICY lab_reference_items_tenant ON lab_reference_items
      FOR ALL
      USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- Valores digitados pelo laboratório (lâmina, texto, correção manual). Ficam
-- separados de exam_results porque NÃO vieram do aparelho — a origem do dado
-- precisa continuar distinguível no prontuário.
CREATE TABLE IF NOT EXISTS exam_manual_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES lab_reference_items(id) ON DELETE SET NULL,
  -- Guardado também por rótulo: se o item for reconfigurado depois, o laudo
  -- antigo não perde o que foi digitado.
  label           text NOT NULL,
  value_text      text,
  entered_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_manual_entries_consulta_label
  ON exam_manual_entries (consultation_id, label);
CREATE INDEX IF NOT EXISTS idx_exam_manual_entries_clinic
  ON exam_manual_entries (clinic_id);

ALTER TABLE exam_manual_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='exam_manual_entries'
       AND policyname='exam_manual_entries_tenant'
  ) THEN
    CREATE POLICY exam_manual_entries_tenant ON exam_manual_entries
      FOR ALL
      USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- O laudo da Animais imprime DUAS colunas de referência no leucograma
-- ("Vlr Ref. Absoluto" e "Vlr Ref. Relativo"), então cada linha pode carregar
-- as duas faixas. Aditivo e idempotente.
ALTER TABLE lab_reference_items ADD COLUMN IF NOT EXISTS ref_abs_text text;
ALTER TABLE lab_reference_items ADD COLUMN IF NOT EXISTS ref_abs_low  numeric;
ALTER TABLE lab_reference_items ADD COLUMN IF NOT EXISTS ref_abs_high numeric;

COMMENT ON COLUMN lab_reference_items.ref_text IS
  'Faixa relativa/única, como a clínica imprime. Ex.: "5,5 A 8,5 milhões/mm³".';
COMMENT ON COLUMN lab_reference_items.ref_abs_text IS
  'Faixa da contagem ABSOLUTA, quando o analito tem par %/# (leucograma).';
COMMENT ON COLUMN lab_reference_items.input_source IS
  'device = vem do analisador · slide = leitura de lâmina digitada · text = campo livre.';
