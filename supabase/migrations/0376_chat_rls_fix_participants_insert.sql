-- E1-S1: Corrige RLS de chat_participants INSERT
-- Antes: qualquer usuário autenticado da clínica podia se auto-inserir em QUALQUER sala.
-- Depois: só pode inserir se for owner do chat OU se o chat for 'direct' (1:1 criado por si).
-- Triggers SECURITY DEFINER (fn_ensure_entity_chat, fn_consultations_create_chat, etc.)
-- bypassam RLS por definição — não são afetados por esta correção.

DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;

CREATE POLICY "chat_participants_insert" ON public.chat_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Mesma clínica obrigatório
    clinic_id = (SELECT clinic_id FROM public.profiles WHERE id = auth.uid())
    AND (
      -- É owner do chat alvo (pode adicionar outros membros)
      EXISTS (
        SELECT 1 FROM public.chat_participants p
         WHERE p.chat_id  = chat_participants.chat_id
           AND p.user_id  = auth.uid()
           AND p.role     = 'owner'
           AND p.left_at  IS NULL
      )
      OR
      -- Está criando um chat direct onde é o criador (openOrCreateDirectChat)
      (
        (SELECT kind FROM public.chats WHERE id = chat_participants.chat_id) = 'direct'
        AND (SELECT created_by FROM public.chats WHERE id = chat_participants.chat_id) = auth.uid()
      )
    )
  );
