-- =============================================================================
-- VetMax — Migration 0195: prescriptions.pharmaceutical_form
--
-- Contexto:
--  O layout de receituário da Almavet (clínica piloto) imprime a FORMA
--  FARMACÊUTICA de cada medicamento alinhada à direita, após a régua
--  pontilhada. Ex: "Gabapentina 150 mg............Cáp", "Kollagenase......Pomada".
--
--  A tabela prescriptions tinha medication, dose, frequency, duration_days,
--  route_of_administration (oral/iv/topico…) e prescription_type, mas NÃO um
--  campo para a apresentação física (Cápsula, Pomada, Comprimido, Solução…).
--  route_of_administration é a VIA, não a forma — são coisas distintas.
--
-- O que muda:
--  - Coluna aditiva pharmaceutical_form (text, nullable). Preenchida pelo MV
--    no consultório ou inferida pela extração IA da anamnese. O motor Canvas
--    resolve via {{pharmaceutical_form}} no Repeater de medicações.
-- =============================================================================

BEGIN;

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS pharmaceutical_form text;

COMMENT ON COLUMN prescriptions.pharmaceutical_form IS
  'Forma farmacêutica / apresentação do medicamento (ex: Cápsula, Comprimido, Pomada, Solução, Suspensão). Distinta de route_of_administration (via). Usada no receituário (tag {{pharmaceutical_form}}).';

COMMIT;
