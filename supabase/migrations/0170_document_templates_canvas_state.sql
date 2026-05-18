-- =============================================================================
-- VetMax — Migration 0170: document_templates.canvas_state (editor visual)
--
-- Adiciona JSONB para persistir o layout do Canvas Editor (drag&drop).
-- Schema canônico:
--   {
--     "version": 1,
--     "page": {
--       "size": "A4"|"A5",
--       "orientation": "portrait"|"landscape",
--       "margins": { "top": 2, "bottom": 2, "left": 2, "right": 2 },
--       "backgroundImageUrl": "https://..." | null
--     },
--     "elements": [ { "id": "...", "kind": "text"|"image"|"line"|"dynamic_tag"|"repeater", ... } ]
--   }
--
-- Coexiste com:
--   - background_image_url / margens / block_style (motor Canva básico, migration 0169)
--   - layout_overlays / page_dimensions (motor Pixel Perfect, migration 0138)
-- O motor é escolhido em runtime: canvas_state IS NOT NULL → editor visual.
-- IDEMPOTENTE.
-- =============================================================================

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS canvas_state jsonb;

COMMENT ON COLUMN document_templates.canvas_state IS
  'Layout do editor visual (drag&drop). Schema: {version:1, page:{size,orientation,margins,backgroundImageUrl}, elements:[]}. Quando NOT NULL, indica que o template usa o motor Canvas Visual (sobrepõe Canva básico).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'document_templates_canvas_state_shape_chk'
  ) THEN
    ALTER TABLE document_templates
      ADD CONSTRAINT document_templates_canvas_state_shape_chk
        CHECK (
          canvas_state IS NULL
          OR (
            jsonb_typeof(canvas_state -> 'page') = 'object'
            AND jsonb_typeof(canvas_state -> 'elements') = 'array'
            AND (canvas_state ->> 'version')::int = 1
          )
        );
  END IF;
END
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_document_templates_canvas_state
  ON document_templates(clinic_id)
  WHERE canvas_state IS NOT NULL;
