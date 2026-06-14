-- E1-S3: Corrige race condition em fn_ensure_entity_chat
-- SELECT→INSERT não é atômico: dois triggers simultâneos podiam tentar inserir
-- o mesmo chat, causando violação de constraint não tratada.
-- Solução: INSERT ... ON CONFLICT DO NOTHING RETURNING id com fallback SELECT.

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
  v_kind    text := p_entity_type;
BEGIN
  IF p_clinic_id IS NULL OR p_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Upsert atômico: INSERT ... ON CONFLICT para evitar race condition
  INSERT INTO public.chats (clinic_id, kind, title, entity_type, entity_id, created_by)
  VALUES (p_clinic_id, v_kind, p_label, p_entity_type, p_entity_id, p_vet_id)
  ON CONFLICT ON CONSTRAINT uq_chats_entity DO NOTHING
  RETURNING id INTO v_chat_id;

  -- Se outro processo ganhou a corrida, busca o id existente
  IF v_chat_id IS NULL THEN
    SELECT id INTO v_chat_id
      FROM public.chats
     WHERE clinic_id   = p_clinic_id
       AND entity_type = p_entity_type
       AND entity_id   = p_entity_id;
  ELSE
    -- Sala nova: insere mensagem system apenas na criação
    INSERT INTO public.chat_messages (chat_id, clinic_id, sent_by, kind, body, metadata)
    VALUES (
      v_chat_id, p_clinic_id, p_vet_id, 'system',
      format('Sala aberta automaticamente para %s.', p_label),
      jsonb_build_object('event','auto_created','entity_type', p_entity_type, 'entity_id', p_entity_id)
    );
  END IF;

  -- Adiciona vet como owner (idempotente)
  IF p_vet_id IS NOT NULL AND v_chat_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (chat_id, clinic_id, user_id, role)
    VALUES (v_chat_id, p_clinic_id, p_vet_id, 'owner')
    ON CONFLICT (chat_id, user_id) DO UPDATE
      SET role    = 'owner',
          left_at = NULL;
  END IF;

  RETURN v_chat_id;
END;
$$;
