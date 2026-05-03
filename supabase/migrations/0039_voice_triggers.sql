-- Migration 0039: Customização de gatilhos de voz por clínica (Banho e Tosa)

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS voice_start_triggers TEXT[] NOT NULL
    DEFAULT ARRAY['assistente', 'gravar evolução', 'gravar evolucao', 'iniciar gravação', 'iniciar gravacao', 'vet max']::TEXT[],
  ADD COLUMN IF NOT EXISTS voice_stop_triggers TEXT[] NOT NULL
    DEFAULT ARRAY['salvar evolução', 'salvar evolucao', 'finalizar', 'pode salvar']::TEXT[];

COMMENT ON COLUMN clinics.voice_start_triggers IS 'Frases personalizadas para ativar gravação (ex: "iniciar banho", "gravar dados")';
COMMENT ON COLUMN clinics.voice_stop_triggers  IS 'Frases personalizadas para finalizar e salvar a evolução (ex: "pode salvar", "finalizar")';
