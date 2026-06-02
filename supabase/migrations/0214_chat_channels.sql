-- ─── Chat Channels: canais de módulo globais ─────────────────────────────────
--
-- Adiciona suporte a chats do tipo 'channel' na tabela pública chats.
-- Um canal representa um espaço de discussão vinculado a um módulo do sistema
-- (ex: '#caixa', '#recepcao') sem entidade clínica específica.
--
-- Mudanças:
--   1. Nova coluna  modulo_contexto TEXT  — identifica o canal (ex: 'caixa')
--   2. Novo valor   'channel'  no CHECK de kind
--   3. Índice UNIQUE (clinic_id, modulo_contexto) para idempotência
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adiciona coluna modulo_contexto (nullable — só preenchida em kind='channel')
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS modulo_contexto TEXT;

-- 2. Atualiza a constraint de kind para aceitar 'channel'
ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chats_kind_check;
ALTER TABLE public.chats
  ADD CONSTRAINT chats_kind_check
  CHECK (kind IN ('direct','group','consultation','hospitalization','surgery','channel'));

-- 3. Índice único: um canal por módulo por clínica (idempotência no upsert)
CREATE UNIQUE INDEX IF NOT EXISTS uq_chats_clinic_channel
  ON public.chats(clinic_id, modulo_contexto)
  WHERE modulo_contexto IS NOT NULL AND entity_id IS NULL;

-- 4. Índice de acesso rápido por módulo
CREATE INDEX IF NOT EXISTS idx_chats_modulo_contexto
  ON public.chats(clinic_id, modulo_contexto)
  WHERE modulo_contexto IS NOT NULL;

-- 5. Comentário descritivo
COMMENT ON COLUMN public.chats.modulo_contexto IS
  'Canal de módulo global (ex: caixa, recepcao). Preenchido apenas quando kind=channel. NULL em direct/group/consultation/hospitalization/surgery.';
