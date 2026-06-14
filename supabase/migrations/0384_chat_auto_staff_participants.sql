-- E4-S1: Inclui recepcionistas/admins em salas de consulta e auxiliares em internação
-- Modifica as funções de trigger existentes para adicionar staff automaticamente.

-- ── Atualiza fn_consultations_create_chat ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_consultations_create_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_pet_name text;
  v_label    text;
  v_chat_id  uuid;
BEGIN
  IF NEW.status IN ('scheduled_future') THEN RETURN NEW; END IF;

  SELECT name INTO v_pet_name FROM public.patients WHERE id = NEW.patient_id;
  v_label := 'Atendimento ' || coalesce(v_pet_name, substr(NEW.id::text, 1, 8));

  v_chat_id := public.fn_ensure_entity_chat(
    NEW.clinic_id, 'consultation', NEW.id, NEW.vet_id, v_label
  );

  -- Adiciona recepcionistas e admins como members (idempotente)
  IF v_chat_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (chat_id, clinic_id, user_id, role)
    SELECT v_chat_id, NEW.clinic_id, p.id, 'member'
      FROM public.profiles p
     WHERE p.clinic_id = NEW.clinic_id
       AND p.role IN ('receptionist', 'admin')
       AND p.id != COALESCE(NEW.vet_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ON CONFLICT (chat_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Atualiza fn_hospitalizations_create_chat ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_hospitalizations_create_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_pet_name text;
  v_label    text;
  v_chat_id  uuid;
BEGIN
  SELECT name INTO v_pet_name FROM public.patients WHERE id = NEW.patient_id;
  v_label := 'Internação ' || coalesce(v_pet_name, substr(NEW.id::text, 1, 8));

  v_chat_id := public.fn_ensure_entity_chat(
    NEW.clinic_id, 'hospitalization', NEW.id,
    NEW.attending_vet_id, v_label
  );

  -- Adiciona auxiliares, enfermeiros e admins como members
  IF v_chat_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (chat_id, clinic_id, user_id, role)
    SELECT v_chat_id, NEW.clinic_id, p.id, 'member'
      FROM public.profiles p
     WHERE p.clinic_id = NEW.clinic_id
       AND p.role IN ('auxiliary', 'nurse', 'admin')
       AND p.id != COALESCE(NEW.attending_vet_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ON CONFLICT (chat_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
