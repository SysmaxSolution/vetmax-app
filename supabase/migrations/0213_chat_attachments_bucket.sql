-- =============================================================================
-- VetMax — Migration 0213: bucket privado para anexos do Chat Interno
--
-- Bucket "chat-attachments" privado (acesso só via signed URL gerada pelo
-- server). Aceita qualquer mime — limite de 25MB por arquivo (a partir do
-- client passa pela action que valida).
--
-- Path: {clinic_id}/{chat_id}/{uuid}.{ext}
--
-- Política Storage: leitura/escrita exclusivas via service_role (todo o
-- acesso é mediado pelo server). Não exporamos o bucket diretamente.
-- =============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-attachments', 'chat-attachments', false, 26214400, NULL)
ON CONFLICT (id) DO NOTHING;

-- Garante que o bucket fica restrito ao service_role (server actions)
-- Sem políticas RLS adicionais para authenticated → ninguém via PostgREST acessa.

COMMIT;
