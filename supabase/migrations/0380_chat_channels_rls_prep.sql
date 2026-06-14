-- E7 prep: Atualiza política SELECT de chats para permitir ver canais públicos
-- sem ser participante (kind='channel' com is_public=true).
-- Também adiciona colunas slug e is_public em chats para E7.

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS slug      text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_slug_clinic
  ON public.chats (clinic_id, slug)
  WHERE slug IS NOT NULL;

-- Atualiza política de SELECT: canais públicos visíveis para toda a clínica
DROP POLICY IF EXISTS "chats_select_participant" ON public.chats;
CREATE POLICY "chats_select_participant" ON public.chats
  FOR SELECT TO authenticated
  USING (
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
    AND (
      public.fn_user_in_chat(id, auth.uid())
      OR (kind = 'channel' AND is_public = true)
    )
  );
