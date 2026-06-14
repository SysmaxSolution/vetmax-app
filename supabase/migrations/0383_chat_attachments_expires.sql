-- E5-S4: Rastreamento de expiração de signed URLs em chat_attachments
-- Permite renovação on-demand e eventual cron de renovação proativa.

ALTER TABLE public.chat_attachments
  ADD COLUMN IF NOT EXISTS url_expires_at timestamptz DEFAULT NULL;

-- Retroativamente marca attachments existentes com storage_path como expirando em 7d da criação
UPDATE public.chat_attachments
   SET url_expires_at = created_at + INTERVAL '7 days'
 WHERE storage_path IS NOT NULL
   AND url_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_attachments_expires
  ON public.chat_attachments (url_expires_at)
  WHERE storage_path IS NOT NULL;
