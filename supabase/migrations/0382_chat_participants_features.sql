-- E5: Adiciona colunas para pin de conversas, force_unread e snooze
-- Todas aditivas com IF NOT EXISTS.

ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS pinned_at    timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pin_order    integer     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS force_unread boolean     DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chat_participants_pinned
  ON public.chat_participants (user_id, pinned_at)
  WHERE pinned_at IS NOT NULL;
