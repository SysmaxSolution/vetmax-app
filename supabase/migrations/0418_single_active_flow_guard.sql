-- ════════════════════════════════════════════════════════════════════════════
-- 0418 — Trava de fluxo único por paciente + Realtime da internação
--
-- Incidente Almavet 24/07: pet internado 3× em 6 min. Causas:
--   (a) createHospitalization só checava duplicata por consultation_id —
--       admissão DIRETA (sem consulta) não tinha verificação nenhuma;
--   (b) hospitalizations fora da publication supabase_realtime — o Kanban
--       assina o canal mas nunca recebe eventos (tela não atualiza sozinha).
--
-- Defesa em profundidade:
--   1) Realtime: publicar hospitalizations (+ prescrições/doses/tarefas).
--   2) Índices únicos parciais: no MÁXIMO 1 fluxo ativo por paciente em cada
--      setor (internação, consulta, banho e tosa) — vale para QUALQUER caminho
--      de escrita, hoje e no futuro.
--   3) Triggers cross-setor: pet com procedimento em andamento num setor não
--      entra em outro (exceção: internar A PARTIR da consulta ativa).
-- Pré-requisito: duplicatas ativas saneadas (fix-active-dupes.mjs, 24/07).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Realtime ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hospitalizations;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hospitalization_prescriptions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hospitalization_dose_administrations;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hospitalization_tasks;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.grooming_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ── 2. Um fluxo ativo por paciente, por setor ───────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hospitalization_active_per_patient
  ON public.hospitalizations (patient_id)
  WHERE status NOT IN ('discharged', 'cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_consultation_active_per_patient
  ON public.consultations (patient_id)
  WHERE status IN ('reception', 'scheduled', 'triage', 'in_progress', 'waiting_exam', 'medication')
    AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_grooming_active_per_patient
  ON public.grooming_sessions (patient_id)
  WHERE current_status IN ('arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup');

-- ── 3. Trava cross-setor ─────────────────────────────────────────────────────
-- Internação: bloqueia se o pet tem consulta ativa (que não seja a de origem)
-- ou banho e tosa em andamento.
CREATE OR REPLACE FUNCTION public.fn_guard_hospitalization_flow()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('discharged', 'cancelled') THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM consultations c
     WHERE c.patient_id = NEW.patient_id AND c.archived_at IS NULL
       AND c.status IN ('reception', 'scheduled', 'triage', 'in_progress', 'waiting_exam', 'medication')
       AND (NEW.consultation_id IS NULL OR c.id <> NEW.consultation_id)
  ) THEN
    RAISE EXCEPTION 'Este pet já está em atendimento (recepção/consultório). Conclua ou interne a partir da consulta em andamento.'
      USING ERRCODE = 'P0001', HINT = 'SINGLE_ACTIVE_FLOW';
  END IF;

  IF EXISTS (
    SELECT 1 FROM grooming_sessions g
     WHERE g.patient_id = NEW.patient_id
       AND g.current_status IN ('arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup')
  ) THEN
    RAISE EXCEPTION 'Este pet está no Banho e Tosa. Finalize a sessão antes de internar.'
      USING ERRCODE = 'P0001', HINT = 'SINGLE_ACTIVE_FLOW';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_hospitalization_flow ON public.hospitalizations;
CREATE TRIGGER guard_hospitalization_flow
  BEFORE INSERT OR UPDATE OF status ON public.hospitalizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_hospitalization_flow();

-- Consulta nova (estados ativos): bloqueia se o pet está internado.
-- scheduled_future segue permitido (agendar retorno de pet internado é legítimo).
CREATE OR REPLACE FUNCTION public.fn_guard_consultation_flow()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('reception', 'scheduled', 'triage', 'in_progress', 'waiting_exam', 'medication') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM hospitalizations h
     WHERE h.patient_id = NEW.patient_id
       AND h.status NOT IN ('discharged', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Este pet está INTERNADO. Utilize o módulo de Internação para registrar atendimentos.'
      USING ERRCODE = 'P0001', HINT = 'SINGLE_ACTIVE_FLOW';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_consultation_flow ON public.consultations;
CREATE TRIGGER guard_consultation_flow
  BEFORE INSERT ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_consultation_flow();

-- Banho e tosa (estados físicos): bloqueia se o pet está internado.
CREATE OR REPLACE FUNCTION public.fn_guard_grooming_flow()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_status IS NULL
     OR NEW.current_status NOT IN ('arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM hospitalizations h
     WHERE h.patient_id = NEW.patient_id
       AND h.status NOT IN ('discharged', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Este pet está INTERNADO e não pode entrar no Banho e Tosa.'
      USING ERRCODE = 'P0001', HINT = 'SINGLE_ACTIVE_FLOW';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_grooming_flow ON public.grooming_sessions;
CREATE TRIGGER guard_grooming_flow
  BEFORE INSERT OR UPDATE OF current_status ON public.grooming_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_grooming_flow();

-- Obs.: consulta × banho e tosa simultâneos seguem PERMITIDOS (combo comum:
-- banho + vacina na mesma visita). Trava total é decisão de produto futura.
