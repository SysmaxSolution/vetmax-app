-- Blindagem contra falha silenciosa de integridade em documentos Canvas.
--
-- Achado (24/09/2026): durante uma janela de deploy instável, uma versão
-- anterior do código (pré-bdf8c998, antes do hash+QR existir) serviu
-- createCanvaPatientDocument por ~12 min sem erro nenhum, gravando
-- documentos com verify_code/content_hash/canvas_state_snapshot nulos —
-- indistinguíveis de um documento normal na tela, mas sem prova de
-- autenticidade. 15 documentos de teste na clínica "Animais RP" foram
-- afetados; removidos abaixo (dados fictícios de teste, não há dado real
-- de tutor/produção nessas linhas).
--
-- A partir de agora, qualquer INSERT/UPDATE em patient_documents com
-- template_id preenchido (= documento do motor Canvas) É OBRIGADO a ter
-- verify_code e content_hash — se uma versão futura do código (nova ou
-- antiga, por causa de skew de deploy) tentar gravar sem esses campos,
-- o INSERT falha com erro visível em vez de suceder silenciosamente.
-- Documentos sem template_id (fluxo legado, fora do Canvas) não são afetados.

DELETE FROM patient_documents
WHERE template_id IS NOT NULL
  AND verify_code IS NULL
  AND content_hash IS NULL;

ALTER TABLE patient_documents
  DROP CONSTRAINT IF EXISTS patient_documents_canva_verify_integrity;

ALTER TABLE patient_documents
  ADD CONSTRAINT patient_documents_canva_verify_integrity
  CHECK (
    template_id IS NULL
    OR (verify_code IS NOT NULL AND content_hash IS NOT NULL)
  );
