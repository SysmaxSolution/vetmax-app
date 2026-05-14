-- Operacao Zero-Touch — permite PNG no bucket document-templates.
--
-- A migration 0138 restringiu o bucket a application/pdf. Agora precisamos
-- aceitar image/png para as paginas limpas geradas pelo canvas-eraser
-- (cleaned_page_paths).
--
-- Tambem permite image/jpeg como fallback para futuras versoes que prefiram
-- preview em JPG por economia de espaco.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg']::text[]
WHERE id = 'document-templates';
