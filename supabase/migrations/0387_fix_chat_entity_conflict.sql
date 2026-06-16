-- 0387: corrige fn_ensure_entity_chat
-- ON CONFLICT ON CONSTRAINT exige pg_constraint; uq_chats_entity é apenas um
-- índice parcial (CREATE UNIQUE INDEX) e não aparece em pg_constraint.
-- Troca para a forma explícita: ON CONFLICT (colunas) WHERE predicado.

CREATE OR REPLACE FUNCTION public.fn_ensure_entity_chat(
  p_clinic_id   uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_vet_id      uuid,
  p_label       text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chat_id uuid;
  v_kind    text := p_entity_type;
BEGIN
  IF p_clinic_id IS NULL OR p_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.chats (clinic_id, kind, title, entity_type, entity_id, created_by)
  VALUES (p_clinic_id, v_kind, p_label, p_entity_type, p_entity_id, p_vet_id)
  ON CONFLICT (clinic_id, entity_type, entity_id) WHERE entity_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_chat_id;

  IF v_chat_id IS NULL THEN
    SELECT id INTO v_chat_id
      FROM public.chats
     WHERE clinic_id   = p_clinic_id
       AND entity_type = p_entity_type
       AND entity_id   = p_entity_id;
  ELSE
    INSERT INTO public.chat_messages (chat_id, clinic_id, sent_by, kind, body, metadata)
    VALUES (
      v_chat_id, p_clinic_id, p_vet_id, 'system',
      format('Sala aberta automaticamente para %s.', p_label),
      jsonb_build_object('event', 'auto_created', 'entity_type', p_entity_type, 'entity_id', p_entity_id)
    );
  END IF;

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
