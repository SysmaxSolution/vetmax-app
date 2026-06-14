-- E2-S1: RPC SQL agregada para contagem de não-lidas
-- Substitui N+1 queries (1 por chat) por uma única passagem com JOIN + SUM.
-- SECURITY DEFINER para rodar no contexto do superuser, evitando RLS overhead.

CREATE OR REPLACE FUNCTION public.fn_chat_unread_count(
  p_user_id   uuid,
  p_clinic_id uuid
) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cnt), 0)::integer
  FROM (
    SELECT COUNT(*) AS cnt
    FROM   public.chat_participants cp
    JOIN   public.chat_messages     cm ON cm.chat_id = cp.chat_id
    WHERE  cp.user_id   = p_user_id
      AND  cp.clinic_id = p_clinic_id
      AND  cp.left_at   IS NULL
      AND  cm.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
      AND  cm.sent_by   != p_user_id
      AND  cm.deleted_at IS NULL
  ) sub
$$;

-- E2 prep: índice GIN full-text para busca em chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_fts
  ON public.chat_messages
  USING gin(to_tsvector('portuguese', coalesce(body, '')))
  WHERE deleted_at IS NULL;
