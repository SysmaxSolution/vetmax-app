-- 0485 — Histogramas e scattergramas do analisador hematológico.
--
-- Por quê uma tabela própria: os OBX tipo ED do URIT BH-5100 trazem 7 imagens
-- PNG em base64 (~46 KB por amostra). Hoje elas só cabiam em
-- exam_results.graph_data, e só quando o código da curva casasse com o código
-- de um analito — o que nunca acontece (o aparelho manda `WBCHisto`, não
-- `WBC`). Resultado prático: os gráficos eram parseados e descartados.
-- Aqui ficam uma vez por consulta/curva, sem duplicar em cada um dos 26
-- analitos. Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS exam_result_graphs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  -- Código da curva como o aparelho mandou (OBX-3): WBCHisto, S0_S90Scattergram…
  code            text NOT NULL,
  -- Rótulo legível resolvido na aplicação (pode ser nulo p/ curva desconhecida).
  title           text,
  mime            text,                -- image/png, image/bmp…
  encoding        text NOT NULL DEFAULT 'Base64',
  data            text NOT NULL,       -- payload base64 cru
  source          text NOT NULL DEFAULT 'hl7',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Uma curva por consulta: reimportar o mesmo ORU substitui em vez de acumular.
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_result_graphs_consultation_code
  ON exam_result_graphs (consultation_id, code);

CREATE INDEX IF NOT EXISTS idx_exam_result_graphs_clinic
  ON exam_result_graphs (clinic_id);

ALTER TABLE exam_result_graphs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'exam_result_graphs'
      AND policyname = 'exam_result_graphs_tenant'
  ) THEN
    CREATE POLICY exam_result_graphs_tenant ON exam_result_graphs
      FOR ALL
      USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;
