-- 0522 — Libera a seção do laudo e aceita linha de imagem.
--
-- Contexto: o acervo de laudos da Clínica Animais (backup do Vertis, 22/10, 5.786 linhas
-- de layout em 694 exames) não cabe nos dois CHECKs que a 0489 fechou. Medido antes:
--
--   • section: a 0489 aceita 5 valores. A Animais usa 27 seções reais —
--     ERITROGRAMA e LEUCOGRAMA (que já temos) mas também PCR PARA, EXAME FÍSICO,
--     BIOQUÍMICA URINÁRIA, SEDIMENTOSCOPIA, EXAME MACROSCÓPICO, CITOLOGIA,
--     LAUDO RADIOGRÁFICO PRÉVIO/DEFINITIVO, REGIÃO REQUISITADA… Com o CHECK atual,
--     22 delas cairiam em 'other' e o laudo perderia a organização em seções.
--
--   • input_source: 1.529 das 5.786 linhas (26%) são placeholder de IMAGEM
--     (IMAGEM 1..4, com ind_resultado = 'IMG'). É o que sustenta laudo de RX,
--     ultrassom, tomografia e ressonância — o núcleo do negócio da Animais
--     (ULTRASSOM ABDOMINAL tem 18.104 requisições; RAIO-X, 26.247).
--
-- NÃO entrou aqui, porque a medição mostrou que não precisamos: um campo de
-- "formato numérico". O `ind_resultado` do Vertis parecia formatação, mas os 58
-- valores são códigos de CÁLCULO DERIVADO (SV1..SV6 = VCM/HCM/CHCM do eritrograma;
-- AOR/ATE/VDF/VSF = medidas de ecocardiograma; ATB = antibiograma). Os analisadores
-- antigos dele mandavam só o valor bruto e o sistema calculava. URIT e BK-200 mandam
-- MCV/MCH/MCHC/RDW já calculados no próprio HL7 — `hemogram-report.ts` só organiza.
-- Campo de cálculo seria código morto.
--
-- Aditivo no comportamento: nada que é válido hoje deixa de ser. Só passa a aceitar mais.

-- ─── 1. section: de enumeração fechada para rótulo livre ─────────────────────
-- Os 5 valores canônicos continuam com significado para o renderer (ordenam as
-- seções do hemograma); os demais são rótulo de seção da clínica.
ALTER TABLE lab_reference_items
  DROP CONSTRAINT IF EXISTS lab_reference_items_section_check;

COMMENT ON COLUMN lab_reference_items.section IS
  'Seção do laudo. Os valores canônicos erythrogram/leukogram/platelets/biochem/other '
  'têm tratamento próprio no renderer; qualquer outro texto é rótulo livre de seção '
  '(ex.: SEDIMENTOSCOPIA, BIOQUIMICA URINARIA, LAUDO RADIOGRAFICO PREVIO).';

-- ─── 2. input_source: aceitar linha de imagem ────────────────────────────────
-- device = vem do analisador · slide = leitura de lâmina digitada ·
-- text = campo livre · image = espaço para imagem anexada (RX, US, tomo, RM).
ALTER TABLE lab_reference_items
  DROP CONSTRAINT IF EXISTS lab_reference_items_input_source_check;

ALTER TABLE lab_reference_items
  ADD CONSTRAINT lab_reference_items_input_source_check
  CHECK (input_source IN ('device', 'slide', 'text', 'image'));

COMMENT ON COLUMN lab_reference_items.input_source IS
  'device = vem do analisador · slide = leitura de lâmina digitada · '
  'text = campo livre · image = espaço de imagem no laudo (RX, US, tomografia, RM).';

-- Numa linha de imagem, faixa de referência e unidade não se aplicam; o que importa
-- é a ordem e o rótulo. Sem constraint nova: a clínica pode deixar tudo nulo.
