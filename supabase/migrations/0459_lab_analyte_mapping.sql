-- 0459 — Fase 2 (Lab): catálogo de analitos + de-para código do aparelho→analito
-- + captura de dados de gráfico (histograma/scattergram) do HL7 para uso futuro.
-- Não depende de acesso físico às máquinas (infra + ingestão + tela de mapeamento).

-- Catálogo de analitos da clínica (WBC, RBC, HGB, ALT, CREA...).
CREATE TABLE IF NOT EXISTS exam_analytes (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  code        TEXT        NOT NULL,                 -- código canônico interno (ex.: WBC)
  name        TEXT        NOT NULL,                 -- nome exibido (ex.: Leucócitos)
  unit        TEXT,                                 -- unidade padrão
  panel       TEXT,                                 -- painel/grupo (Hemograma, Bioquímico)
  sort_order  INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_analytes_clinic_code ON exam_analytes (clinic_id, code);

-- De-para: código/nome que o aparelho manda → analito do catálogo. Por clínica e
-- (opcionalmente) por agente/aparelho, para códigos proprietários divergentes.
CREATE TABLE IF NOT EXISTS lab_analyte_mappings (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id     UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  lab_agent_id  UUID,                                -- NULL = vale p/ qualquer aparelho da clínica
  device_code   TEXT,                                -- código do OBX-3 (ex.: 6690-2 / WBC)
  device_name   TEXT,                                -- nome cru (fallback quando não há código)
  analyte_id    UUID        NOT NULL REFERENCES exam_analytes(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lab_map_clinic_code ON lab_analyte_mappings (clinic_id, device_code);
CREATE INDEX IF NOT EXISTS idx_lab_map_clinic_name ON lab_analyte_mappings (clinic_id, device_name);

-- Resultado resolvido contra o catálogo + captura de gráfico (ED do HL7).
ALTER TABLE exam_results
  ADD COLUMN IF NOT EXISTS analyte_id UUID REFERENCES exam_analytes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS graph_data JSONB,          -- {kind, encoding, mime, data} do histograma/scattergram
  ADD COLUMN IF NOT EXISTS raw_hl7 TEXT;              -- mensagem crua (auditoria/re-parse)

ALTER TABLE exam_analytes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_analyte_mappings ENABLE ROW LEVEL SECURITY;
-- Sem policy: acesso via service role (server actions).
