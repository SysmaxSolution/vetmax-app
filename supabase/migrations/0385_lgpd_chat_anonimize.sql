-- E6-S1: LGPD — função de anonimização de dados de chat por titular
-- Chamada por resolveDeletionRequest() em compliance.ts.
-- Nullifica body + marca deleted_at; remove arquivos físicos é feito no TS.

CREATE OR REPLACE FUNCTION public.anonimize_chat_for_subject(
  p_clinic_id uuid,
  p_user_id   uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anonimiza mensagens enviadas pelo titular
  UPDATE public.chat_messages
     SET body       = '[removido por solicitação LGPD]',
         metadata   = jsonb_build_object('deleted_by_lgpd', true),
         deleted_at = now()
   WHERE sent_by    = p_user_id
     AND clinic_id  = p_clinic_id
     AND deleted_at IS NULL;

  -- Marca saída de todas as salas que participou
  UPDATE public.chat_participants
     SET left_at = COALESCE(left_at, now())
   WHERE user_id  = p_user_id
     AND clinic_id = p_clinic_id;
END;
$$;

-- E6-S2: View para exportação de dados de chat (portabilidade LGPD / DPA)
CREATE OR REPLACE VIEW public.chat_data_subject_report AS
SELECT
  cm.clinic_id,
  cm.sent_by          AS data_subject_id,
  c.title             AS chat_title,
  c.kind              AS chat_kind,
  cm.body,
  cm.kind             AS msg_kind,
  cm.created_at
FROM public.chat_messages cm
JOIN public.chats c ON c.id = cm.chat_id
WHERE cm.sent_by   IS NOT NULL
  AND cm.deleted_at IS NULL;
