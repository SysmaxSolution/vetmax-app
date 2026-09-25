-- 0466 — Snapshot do layout (canvas_state) por documento gerado.
-- Ao criar um patient_document pelo motor Canvas, o canvas_state ATUAL do
-- template é copiado para o documento: reimpressões futuras usam o snapshot
-- (histórico fiel), mesmo que o admin altere o modelo depois.
-- Documentos antigos (snapshot NULL) continuam usando o template (fallback).

ALTER TABLE patient_documents
  ADD COLUMN IF NOT EXISTS canvas_state_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_taken_at     TIMESTAMPTZ;

COMMENT ON COLUMN patient_documents.canvas_state_snapshot IS
  'Cópia imutável do document_templates.canvas_state no momento da emissão (motor Canvas Nativo). NULL = documento anterior à migration 0466 (usa o template).';
COMMENT ON COLUMN patient_documents.snapshot_taken_at IS
  'Quando o snapshot foi capturado (emissão ou backfill na 1ª edição).';
