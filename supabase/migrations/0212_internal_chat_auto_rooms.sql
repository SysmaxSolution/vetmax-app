-- =============================================================================
-- VetMax — Migration 0212: Chat Interno — salas automáticas por atendimento
--
-- Ao iniciar Consulta / Internação / Cirurgia, cria automaticamente uma sala
-- de chat ligada (chats.entity_type/entity_id) e inclui o vet responsável
-- como owner. Idempotente via ON CONFLICT no índice uq_chats_entity.
--
-- Se o vet ainda não estiver definido no momento do INSERT, a sala já fica
-- criada — o trigger AFTER UPDATE pega quando o campo for preenchido depois
-- (ex: atribuição posterior). Mensagem 'system' inicial registra o evento.
-- =============================================================================

BEGIN;

-- ── Helper: garante sala + vet owner para uma entidade ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_ensure_entity_chat(
  p_clinic_id    uuid,
  p_entity_type  text,
  p_entity_id    uuid,
  p_vet_id       uuid,
  p_label        text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_chat_id uuid;
  v_kind    text := p_entity_type;  -- 'consultation' | 'hospitalization' | 'surgery'
BEGIN
  IF p_clinic_id IS NULL OR p_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Procura sala existente para a entidade
  SELECT id INTO v_chat_id
    FROM public.chats
   WHERE clinic_id = p_clinic_id
     AND entity_type = p_entity_type
     AND entity_id   = p_entity_id
   LIMIT 1;

  IF v_chat_id IS NULL THEN
    INSERT INTO public.chats (clinic_id, kind, title, entity_type, entity_id, created_by)
    VALUES (p_clinic_id, v_kind, p_label, p_entity_type, p_entity_id, p_vet_id)
    RETURNING id INTO v_chat_id;

    -- Mensagem de sistema: registra abertura
    INSERT INTO public.chat_messages (chat_id, clinic_id, sent_by, kind, body, metadata)
    VALUES (
      v_chat_id, p_clinic_id, p_vet_id, 'system',
      format('Sala aberta automaticamente para %s.', p_label),
      jsonb_build_object('event','auto_created','entity_type', p_entity_type, 'entity_id', p_entity_id)
    );
  END IF;

  -- Adiciona vet como owner (idempotente — ON CONFLICT no UNIQUE)
  IF p_vet_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (chat_id, clinic_id, user_id, role)
    VALUES (v_chat_id, p_clinic_id, p_vet_id, 'owner')
    ON CONFLICT (chat_id, user_id) DO UPDATE
      SET role = 'owner',  -- promove a owner se já existia como member
          left_at = NULL;
  END IF;

  RETURN v_chat_id;
END;
$$;

-- ── Trigger: consultations ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_consultations_create_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_pet_name text;
  v_label    text;
BEGIN
  -- Só cria sala quando entra em fluxo ativo (não vamos abrir sala para 'scheduled_future')
  IF NEW.status IN ('scheduled_future') THEN RETURN NEW; END IF;

  SELECT name INTO v_pet_name FROM public.patients WHERE id = NEW.patient_id;
  v_label := 'Atendimento ' || coalesce(v_pet_name, substr(NEW.id::text, 1, 8));

  PERFORM public.fn_ensure_entity_chat(
    NEW.clinic_id,
    'consultation',
    NEW.id,
    NEW.vet_id,
    v_label
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultations_create_chat ON public.consultations;
CREATE TRIGGER trg_consultations_create_chat
  AFTER INSERT OR UPDATE OF vet_id, status ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.fn_consultations_create_chat();

-- ── Trigger: hospitalizations ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_hospitalizations_create_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_pet_name text;
  v_label    text;
BEGIN
  SELECT name INTO v_pet_name FROM public.patients WHERE id = NEW.patient_id;
  v_label := 'Internação ' || coalesce(v_pet_name, substr(NEW.id::text, 1, 8));

  PERFORM public.fn_ensure_entity_chat(
    NEW.clinic_id,
    'hospitalization',
    NEW.id,
    NEW.attending_vet_id,
    v_label
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hospitalizations_create_chat ON public.hospitalizations;
CREATE TRIGGER trg_hospitalizations_create_chat
  AFTER INSERT OR UPDATE OF attending_vet_id ON public.hospitalizations
  FOR EACH ROW EXECUTE FUNCTION public.fn_hospitalizations_create_chat();

-- ── Trigger: surgeries ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_surgeries_create_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_pet_name text;
  v_label    text;
BEGIN
  SELECT name INTO v_pet_name FROM public.patients WHERE id = NEW.patient_id;
  v_label := 'Cirurgia ' || coalesce(NEW.procedure_name, '') ||
             CASE WHEN v_pet_name IS NOT NULL THEN ' — ' || v_pet_name ELSE '' END;

  PERFORM public.fn_ensure_entity_chat(
    NEW.clinic_id,
    'surgery',
    NEW.id,
    NEW.surgeon_id,
    v_label
  );

  -- Inclui anestesista também (não é owner — apenas member)
  IF NEW.anesthetist_id IS NOT NULL AND NEW.anesthetist_id <> NEW.surgeon_id THEN
    INSERT INTO public.chat_participants (chat_id, clinic_id, user_id, role)
    SELECT c.id, NEW.clinic_id, NEW.anesthetist_id, 'member'
      FROM public.chats c
     WHERE c.clinic_id = NEW.clinic_id
       AND c.entity_type = 'surgery'
       AND c.entity_id = NEW.id
    ON CONFLICT (chat_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_surgeries_create_chat ON public.surgeries;
CREATE TRIGGER trg_surgeries_create_chat
  AFTER INSERT OR UPDATE OF surgeon_id, anesthetist_id ON public.surgeries
  FOR EACH ROW EXECUTE FUNCTION public.fn_surgeries_create_chat();

COMMIT;
