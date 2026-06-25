-- =============================================================================
-- VetMax — Migration 0410: Dicionário de correção de transcrição (Frente 2)
--
-- Corrige termos veterinários/fármacos que a Web Speech API erra, ANTES de a
-- transcrição ir ao Haiku. Dois níveis: regras da própria clínica + camada
-- global anonimizada (clinic_id NULL). O aprendizado/promoção vem nas fases
-- seguintes; aqui fica a estrutura + captura crua das correções do MV.
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Dicionário de correções (ativo)
--    clinic_id NULL = regra GLOBAL, aplicável a todas as clínicas.
-- =========================================================================

CREATE TABLE IF NOT EXISTS voice_correction_terms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID        REFERENCES clinics(id) ON DELETE CASCADE,
  wrong_term  TEXT        NOT NULL,
  right_term  TEXT        NOT NULL,
  hits        INT         NOT NULL DEFAULT 1,
  status      TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'suggested', 'rejected')),
  source      TEXT        NOT NULL DEFAULT 'manual'
              CHECK (source IN ('manual', 'learned', 'global')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE voice_correction_terms IS
  'Frente 2: dicionário de correção de transcrição por clínica + global (clinic_id NULL).';
COMMENT ON COLUMN voice_correction_terms.clinic_id IS 'NULL = regra global aplicável a todas as clínicas.';
COMMENT ON COLUMN voice_correction_terms.hits IS 'Quantas vezes a correção foi observada (peso p/ promoção).';
COMMENT ON COLUMN voice_correction_terms.status IS 'active=aplicada | suggested=candidata p/ revisão | rejected=descartada.';
COMMENT ON COLUMN voice_correction_terms.source IS 'manual=cadastrada | learned=minerada da edição do MV | global=promovida.';

-- Unicidade por clínica e na faixa global (case-insensitive no termo errado).
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_corr_clinic_term
  ON voice_correction_terms (clinic_id, lower(wrong_term))
  WHERE clinic_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_corr_global_term
  ON voice_correction_terms (lower(wrong_term))
  WHERE clinic_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_voice_corr_lookup
  ON voice_correction_terms (clinic_id, status);

-- =========================================================================
-- 2. Eventos de correção (log cru p/ aprendizado — Fase 2.1)
--    Guarda o par transcrição-bruta vs texto-final que o MV deixou no
--    prontuário; a mineração de candidatos roda sobre isto depois.
-- =========================================================================

CREATE TABLE IF NOT EXISTS voice_correction_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  consultation_id UUID,
  raw_transcript  TEXT        NOT NULL,
  final_text      TEXT        NOT NULL,
  processed       BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE voice_correction_events IS
  'Frente 2: par (transcrição bruta, texto final do MV) — fonte da mineração de correções.';

CREATE INDEX IF NOT EXISTS idx_voice_corr_events_unprocessed
  ON voice_correction_events (clinic_id, processed)
  WHERE processed = false;

-- =========================================================================
-- 3. RLS
-- =========================================================================

ALTER TABLE voice_correction_terms  ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_correction_events ENABLE ROW LEVEL SECURITY;

-- Terms: a clínica lê suas regras + as globais; escreve apenas as próprias.
-- (Regras globais são geridas pelo admin client / service_role, fora do RLS.)
CREATE POLICY voice_corr_select ON voice_correction_terms FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid())
    OR clinic_id IS NULL
  );

CREATE POLICY voice_corr_insert ON voice_correction_terms FOR INSERT
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY voice_corr_update ON voice_correction_terms FOR UPDATE
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY voice_corr_delete ON voice_correction_terms FOR DELETE
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- Events: restritos à própria clínica (dado clínico cru).
CREATE POLICY voice_corr_events_all ON voice_correction_events FOR ALL
  USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

COMMIT;
