-- 0509 — O que falta em lab_reference_items para receber o acervo da Animais,
--        e catálogo de máscaras de laudo reutilizáveis.
--
-- Contexto: o backup do Vertis (sistema legado da Clínica Animais, 2026-10-22)
-- traz 22.054 valores de referência e 300 máscaras de texto de laudo. Ao mapear
-- campo a campo contra `lab_reference_items` (0489), três coisas não têm onde cair.
-- Tudo aqui é aditivo e idempotente; nenhuma clínica existente muda de comportamento.
--
-- MEDIDO ANTES DE CONSTRUIR (é o critério do Diretor: o banco do fornecedor não é lei):
--
--   • faixa por IDADE  → 6.641 das 22.054 referências (30,1%) segmentam idade.
--     Sem isso a carga perde 30% do acervo. Filhote e idoso têm faixa diferente
--     de verdade (fosfatase alcalina, creatinina). CONSTRUIR.
--   • unidade da coluna ABSOLUTA → `ref_abs_text/low/high` já existem (fim da 0489),
--     mas sem a unidade. O Vertis guarda `unid_medida_absoluto` separado porque
--     a coluna relativa é "%" e a absoluta "/mm³". CONSTRUIR.
--   • faixa por SEXO → só 363 referências (1,6%). Volume baixo, mas é uma coluna
--     aditiva e evita descartar dado existente. CONSTRUIR (barato).
--   • máscaras de laudo → 300 textos que o Vertis referencia por código
--     (`teste.cod_res_padrao`), reaproveitados em vários exames. Hoje só existe
--     `default_text` por item, o que duplicaria o mesmo texto em cada linha.
--     CONSTRUIR catálogo + referência.
--
-- NÃO construído, porque a medição mostrou que não há dado (em 84.409 pets):
--   nro_rg_animal 9 · ind_doacao 4 · ind_pedigree 2 · id_tatuagem 1 ·
--   nro_registro 0 · obs_animal 0 · ind_lau_email 0 · senha_internet 0.
--   E `ind_porte` (30.375) já tem destino em `patients.size`;
--   `dat_ult_visita` (58.905) é derivável do histórico de atendimento.

-- ─── 1. Faixa por idade ───────────────────────────────────────────────────────
-- Em DIAS, para casar com qualquer unidade de origem sem perder precisão
-- (o Vertis guarda em dias: 32850 = 90 anos = "serve para qualquer idade").
-- NULL em qualquer ponta = faixa aberta naquele lado.
ALTER TABLE lab_reference_items ADD COLUMN IF NOT EXISTS age_min_days integer;
ALTER TABLE lab_reference_items ADD COLUMN IF NOT EXISTS age_max_days integer;
ALTER TABLE lab_reference_items ADD COLUMN IF NOT EXISTS age_text     text;

-- ─── 2. Unidade da coluna absoluta ────────────────────────────────────────────
ALTER TABLE lab_reference_items ADD COLUMN IF NOT EXISTS ref_abs_unit text;

-- ─── 3. Faixa por sexo ────────────────────────────────────────────────────────
-- NULL = serve para ambos (é o caso de 98,4% do acervo da Animais).
ALTER TABLE lab_reference_items ADD COLUMN IF NOT EXISTS sex text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lab_reference_items_sex_check'
  ) THEN
    ALTER TABLE lab_reference_items
      ADD CONSTRAINT lab_reference_items_sex_check
      CHECK (sex IS NULL OR sex IN ('male', 'female'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lab_reference_items_age_check'
  ) THEN
    ALTER TABLE lab_reference_items
      ADD CONSTRAINT lab_reference_items_age_check
      CHECK (
        (age_min_days IS NULL OR age_min_days >= 0)
        AND (age_max_days IS NULL OR age_max_days >= 0)
        AND (age_min_days IS NULL OR age_max_days IS NULL OR age_min_days <= age_max_days)
      );
  END IF;
END $$;

COMMENT ON COLUMN lab_reference_items.age_min_days IS
  'Idade mínima do paciente, em dias, para esta faixa valer. NULL = sem piso.';
COMMENT ON COLUMN lab_reference_items.age_max_days IS
  'Idade máxima do paciente, em dias. NULL = sem teto. Faixa única = ambos NULL.';
COMMENT ON COLUMN lab_reference_items.age_text IS
  'Como a faixa de idade se imprime no laudo. Ex.: "até 6 meses", "acima de 8 anos".';
COMMENT ON COLUMN lab_reference_items.ref_abs_unit IS
  'Unidade da faixa ABSOLUTA, quando difere da relativa (relativa "%", absoluta "/mm³").';
COMMENT ON COLUMN lab_reference_items.sex IS
  'Sexo a que a faixa se aplica. NULL = ambos (o caso de 98% do acervo).';

-- Seleção da faixa certa passa a filtrar por idade e sexo além de set_id.
CREATE INDEX IF NOT EXISTS idx_lab_reference_items_faixa
  ON lab_reference_items (set_id, analyte_code, age_min_days, age_max_days);

-- ─── 4. Catálogo de máscaras de laudo ─────────────────────────────────────────
-- Texto padrão reaproveitável, por clínica. O Vertis chama de `resultado_padrao`
-- e referencia por código em cada analito — é como a Animais escreve
-- "Sugere-se cultura bacteriana com antibiograma para confirmação de diagnóstico."
-- sem redigitar. Separado de `lab_reference_items.default_text` porque o mesmo
-- texto serve a muitos itens: guardar inline duplicaria o conteúdo e, pior,
-- faria a correção de um texto ter de ser repetida em cada linha.
CREATE TABLE IF NOT EXISTS lab_result_presets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL,
  -- Código curto como a clínica já conhece ("CBA", "MAPA-NEG", "mala").
  -- Preservar o código de origem deixa a conferência pós-migração possível.
  code        text NOT NULL,
  -- Resumo de uma linha, para escolher na lista.
  label       text,
  -- O texto que entra no laudo.
  body        text NOT NULL,
  -- Versão sem marcação, quando a clínica mantém as duas (o Vertis mantém).
  body_plain  text,
  -- Setor do laboratório a que pertence (hematologia, parasitologia…), opcional.
  sector      text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_result_presets_code
  ON lab_result_presets (clinic_id, code);
CREATE INDEX IF NOT EXISTS idx_lab_result_presets_clinic
  ON lab_result_presets (clinic_id, is_active);

ALTER TABLE lab_result_presets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='lab_result_presets'
       AND policyname='lab_result_presets_tenant'
  ) THEN
    CREATE POLICY lab_result_presets_tenant ON lab_result_presets
      FOR ALL
      USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- Liga o item de referência à máscara. ON DELETE SET NULL: apagar a máscara
-- não pode derrubar a configuração do laudo.
ALTER TABLE lab_reference_items
  ADD COLUMN IF NOT EXISTS preset_id uuid REFERENCES lab_result_presets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lab_reference_items_preset
  ON lab_reference_items (preset_id) WHERE preset_id IS NOT NULL;

COMMENT ON COLUMN lab_reference_items.preset_id IS
  'Máscara de texto reaproveitável. Quando preenchido, tem precedência sobre default_text.';
COMMENT ON TABLE lab_result_presets IS
  'Textos padrão de laudo, por clínica. Origem: resultado_padrao do Vertis (300 na Animais).';

-- ─── 5. Segundo telefone do tutor ─────────────────────────────────────────────
-- 6.813 dos 49.511 tutores da Animais (13,8%) têm um segundo telefone cadastrado.
-- Os telefones 3 e 4 do Vertis têm 181 registros somados — esses vão para `notes`,
-- não valem coluna.
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS phone2 text;

COMMENT ON COLUMN tutors.phone2 IS
  'Telefone secundário. O principal continua em phone.';
