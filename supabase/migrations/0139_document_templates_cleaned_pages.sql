-- Operacao Zero-Touch (Flatten & Clean)
-- Adiciona a coluna `cleaned_page_paths` em `document_templates`.
--
-- Cada entrada do array eh o path no bucket `document-templates` de UM PNG
-- por pagina, com os valores antigos do template ja apagados (whiteout em
-- pixel). O motor de geracao desenha esse PNG como fundo da pagina e apenas
-- carimba os textos novos por cima. Fim das colisoes com fluxo de texto
-- nativo do PDF original.

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS cleaned_page_paths jsonb;

COMMENT ON COLUMN document_templates.cleaned_page_paths IS
  'Operacao Zero-Touch: array de paths PNG por pagina (bucket document-templates) '
  'apos canvas-eraser. Usado como fundo imutavel pela geracao. NULL para templates '
  'antigos (pre-Flatten); nesse caso o gerador usa fluxo legacy via original_pdf_path.';
