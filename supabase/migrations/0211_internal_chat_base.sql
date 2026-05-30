-- =============================================================================
-- VetMax — Migration 0211: Motor de Comunicação Interna (Chat) — Fase 1
--
-- Tabelas:
--   chats               Sala (direct, group, ou ligada a Consulta/Internação/Cirurgia)
--   chat_participants   Quem participa de quem + last_read_at (cursor de não-lidas)
--   chat_messages       Mensagens (texto, sistema, anexo)
--   chat_attachments    Metadado de anexo (PDF/imagem/arquivo) ligado a uma mensagem
--
-- Princípio: 1 chat por entidade hospitalar (UNIQUE em entity_type+entity_id quando
-- entity_id NOT NULL) → permite o "trigger automático: ao iniciar Consulta cria sala"
-- ser idempotente. Direct (1:1) e group puros ficam com entity_id NULL.
--
-- RLS: usuário só lê/escreve nas mensagens dos chats em que participa, dentro
-- da própria clínica. Multi-tenancy via clinic_id em todas as tabelas.
--
-- Realtime: ADD TABLE chat_messages, chat_participants → o client recebe broadcasts
-- de nova mensagem (UI cresce em tempo real) e de leitura (badge zera nos outros
-- devices).
-- =============================================================================

BEGIN;

-- ── chats ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chats (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title         text,                                       -- usado em groups; NULL em direct
  kind          text        NOT NULL DEFAULT 'direct'
                            CHECK (kind IN ('direct','group','consultation','hospitalization','surgery')),
  entity_type   text        CHECK (entity_type IN ('consultation','hospitalization','surgery')),
  entity_id     uuid,                                        -- FK lógica (não engessamos para evitar cascade entre módulos)
  created_by    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (entity_type IS NULL AND entity_id IS NULL)
    OR (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  )
);

-- 1 sala por entidade clínica (idempotência do trigger auto-create)
CREATE UNIQUE INDEX IF NOT EXISTS uq_chats_entity
  ON public.chats (clinic_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chats_clinic_last
  ON public.chats (clinic_id, last_message_at DESC)
  WHERE archived_at IS NULL;

-- ── chat_participants ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_participants (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       uuid        NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  clinic_id     uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          text        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('owner','member')),
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  left_at       timestamptz,
  UNIQUE (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user
  ON public.chat_participants (user_id, clinic_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_participants_chat
  ON public.chat_participants (chat_id)
  WHERE left_at IS NULL;

-- ── chat_messages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       uuid        NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  clinic_id     uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  sent_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind          text        NOT NULL DEFAULT 'text'
                            CHECK (kind IN ('text','system','attachment')),
  body          text,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,    -- ex: { "event": "auto_created", "doc_kind": "prescription" }
  edited_at     timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_time
  ON public.chat_messages (chat_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── chat_attachments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid        NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  chat_id         uuid        NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  kind            text        NOT NULL DEFAULT 'file'
                              CHECK (kind IN ('pdf','image','file')),
  title           text        NOT NULL,
  file_url        text,                                       -- URL pública/assinada do Storage
  storage_path    text,                                       -- path no Supabase Storage (bucket/key)
  mime_type       text,
  byte_size       integer,
  source_entity   text        CHECK (source_entity IN ('prescription','term','exam','laudo','receipt','other')),
  source_id       uuid,                                       -- id da entidade que originou (ex: prescription.id)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_chat
  ON public.chat_attachments (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_source
  ON public.chat_attachments (clinic_id, source_entity, source_id)
  WHERE source_id IS NOT NULL;

-- ── Trigger: last_message_at em chats ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_messages_touch_chat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.chats
    SET last_message_at = NEW.created_at
    WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_touch ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_touch
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_chat_messages_touch_chat();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.chats              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments   ENABLE ROW LEVEL SECURITY;

-- Helper: usuário participa do chat?
CREATE OR REPLACE FUNCTION public.fn_user_in_chat(p_chat uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
     WHERE chat_id = p_chat AND user_id = p_user AND left_at IS NULL
  );
$$;

-- chats: ver os chats da clínica em que participo; criar/atualizar requer participação
DROP POLICY IF EXISTS "chats_select_participant" ON public.chats;
CREATE POLICY "chats_select_participant" ON public.chats
  FOR SELECT TO authenticated
  USING (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
    AND public.fn_user_in_chat(id, auth.uid())
  );

DROP POLICY IF EXISTS "chats_insert_own_clinic" ON public.chats;
CREATE POLICY "chats_insert_own_clinic" ON public.chats
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "chats_update_participant" ON public.chats;
CREATE POLICY "chats_update_participant" ON public.chats
  FOR UPDATE TO authenticated
  USING (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
    AND public.fn_user_in_chat(id, auth.uid())
  );

-- chat_participants: vejo eu mesmo e meus pares de chats que participo
DROP POLICY IF EXISTS "chat_participants_select_peers" ON public.chat_participants;
CREATE POLICY "chat_participants_select_peers" ON public.chat_participants
  FOR SELECT TO authenticated
  USING (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
    AND (
      user_id = auth.uid()
      OR public.fn_user_in_chat(chat_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
CREATE POLICY "chat_participants_insert" ON public.chat_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "chat_participants_update_self" ON public.chat_participants;
CREATE POLICY "chat_participants_update_self" ON public.chat_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_participants_delete_owner" ON public.chat_participants;
CREATE POLICY "chat_participants_delete_owner" ON public.chat_participants
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.chat_participants p
       WHERE p.chat_id = chat_id AND p.user_id = auth.uid()
         AND p.role = 'owner' AND p.left_at IS NULL
    )
  );

-- chat_messages: só leio se participo; só escrevo como eu mesmo
DROP POLICY IF EXISTS "chat_messages_select_participant" ON public.chat_messages;
CREATE POLICY "chat_messages_select_participant" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.fn_user_in_chat(chat_id, auth.uid()));

DROP POLICY IF EXISTS "chat_messages_insert_self" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_self" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
    AND sent_by = auth.uid()
    AND public.fn_user_in_chat(chat_id, auth.uid())
  );

DROP POLICY IF EXISTS "chat_messages_update_self" ON public.chat_messages;
CREATE POLICY "chat_messages_update_self" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (sent_by = auth.uid())
  WITH CHECK (sent_by = auth.uid());

-- chat_attachments: idem mensagem-pai
DROP POLICY IF EXISTS "chat_attachments_select_participant" ON public.chat_attachments;
CREATE POLICY "chat_attachments_select_participant" ON public.chat_attachments
  FOR SELECT TO authenticated
  USING (public.fn_user_in_chat(chat_id, auth.uid()));

DROP POLICY IF EXISTS "chat_attachments_insert_participant" ON public.chat_attachments;
CREATE POLICY "chat_attachments_insert_participant" ON public.chat_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
    AND public.fn_user_in_chat(chat_id, auth.uid())
  );

-- Service role bypassa (admin client server-side)
GRANT ALL ON public.chats              TO service_role;
GRANT ALL ON public.chat_participants  TO service_role;
GRANT ALL ON public.chat_messages      TO service_role;
GRANT ALL ON public.chat_attachments   TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.chats              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_messages      TO authenticated;
GRANT SELECT, INSERT ON public.chat_attachments           TO authenticated;

-- ─── Realtime: broadcast de mensagens e leitura ───────────────────────────────
-- Só adiciona à publication se ela existir (em ambientes Supabase ela já existe).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chats';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;

COMMIT;
