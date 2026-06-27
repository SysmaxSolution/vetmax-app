-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0411: Blindagem médico-legal do prontuário + retenção de voz (LGPD)
-- ───────────────────────────────────────────────────────────────────────────
-- Origem: llm-council 2026-06-26 (resposta competitiva AllEars + auditoria CFMV/LGPD).
-- Fecha 2 gaps P0:
--   (CFMV Res. 1321/2020) prontuário FINALIZADO era editável/des-finalizável no
--   banco — reescrita silenciosa possível. Agora: imutável; correção só por ADENDO.
--   (LGPD Art. 16/37) eventos crus de voz (raw_transcript/final_text) ficavam em
--   claro sem TTL. Agora: função de anonimização por retenção (chamável por cron).
--
-- Observação: DELETE já é bloqueado por check_consultation_cfmv_retention (5 anos).
-- Esta migration cobre UPDATE (imutabilidade de campo) e a des-finalização (reopen).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabela de ADENDOS (correções append-only a prontuário finalizado) ──────
CREATE TABLE IF NOT EXISTS consultation_addenda (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id)       ON DELETE CASCADE,
    consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE RESTRICT,
    author_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    author_crmv     TEXT,                       -- snapshot do CRMV do autor (CFMV)
    reason          TEXT NOT NULL,              -- motivo da retificação
    addendum_text   TEXT NOT NULL,              -- conteúdo do adendo
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addenda_consultation ON consultation_addenda(consultation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_addenda_clinic       ON consultation_addenda(clinic_id);

ALTER TABLE consultation_addenda ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT por clínica. SEM policies de UPDATE/DELETE → imutável por design.
DROP POLICY IF EXISTS addenda_select ON consultation_addenda;
CREATE POLICY addenda_select ON consultation_addenda FOR SELECT
    USING (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS addenda_insert ON consultation_addenda;
CREATE POLICY addenda_insert ON consultation_addenda FOR INSERT
    WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));

-- ── 2. Trigger de IMUTABILIDADE do prontuário finalizado (BEFORE UPDATE) ──────
-- "Finalizado" = status='completed' AND is_reviewed_by_vet=TRUE (alta CFMV).
-- Estados em andamento (in_progress, waiting_exam, medication, hospitalized) NÃO
-- são afetados — o MV ainda está escrevendo. Campos OPERACIONAIS (pagamento,
-- convênio, arquivamento, confirmação WPP) permanecem editáveis pós-alta.
CREATE OR REPLACE FUNCTION enforce_consultation_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'completed' AND OLD.is_reviewed_by_vet IS TRUE THEN

        -- (a) Proibir des-finalização (reabrir / zerar revisão)
        IF NEW.status IS DISTINCT FROM 'completed'
           OR NEW.is_reviewed_by_vet IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION
              'Prontuário finalizado não pode ser reaberto nem des-finalizado. Registre um adendo (CFMV Res. 1321/2020).'
              USING ERRCODE = 'P0001', HINT = 'CFMV_IMMUTABLE_REOPEN';
        END IF;

        -- (b) Proibir alteração de qualquer campo CLÍNICO do prontuário fechado
        IF  (NEW.vet_notes          IS DISTINCT FROM OLD.vet_notes)
         OR (NEW.anamnesis          IS DISTINCT FROM OLD.anamnesis)
         OR (NEW.reason             IS DISTINCT FROM OLD.reason)
         OR (NEW.exam_notes         IS DISTINCT FROM OLD.exam_notes)
         OR (NEW.suggested_diagnosis IS DISTINCT FROM OLD.suggested_diagnosis)
         OR (NEW.audio_transcript   IS DISTINCT FROM OLD.audio_transcript)
         OR (NEW.triage_notes       IS DISTINCT FROM OLD.triage_notes)
         OR (NEW.visit_reason       IS DISTINCT FROM OLD.visit_reason)
         OR (NEW.weight             IS DISTINCT FROM OLD.weight)
         OR (NEW.temperature        IS DISTINCT FROM OLD.temperature)
         OR (NEW.vital_signs        IS DISTINCT FROM OLD.vital_signs)
        THEN
            RAISE EXCEPTION
              'Campo clínico de prontuário finalizado é imutável. Registre um adendo (CFMV Res. 1321/2020).'
              USING ERRCODE = 'P0001', HINT = 'CFMV_IMMUTABLE_FIELD';
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultation_immutability ON consultations;
CREATE TRIGGER trg_consultation_immutability
    BEFORE UPDATE ON consultations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_consultation_immutability();

-- ── 3. Retenção/anonimização dos eventos crus de voz (LGPD Art. 16) ──────────
ALTER TABLE voice_correction_events ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION rpc_purge_voice_correction_events(p_retention_days INT DEFAULT 180)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
    UPDATE voice_correction_events
       SET raw_transcript = NULL,
           final_text     = NULL,
           purged_at      = NOW()
     WHERE processed IS TRUE
       AND purged_at IS NULL
       AND created_at < NOW() - (p_retention_days || ' days')::interval;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION rpc_purge_voice_correction_events(INT) IS
  'LGPD: anonimiza (NULL no texto cru) eventos de voz já processados após N dias (default 180). Chamar via cron/routine. Council 2026-06-26.';
