-- 0487 — Curvas do analisador saem do banco e vão para o Storage.
--
-- Por quê: a 0485 guardava os 7 PNGs de cada hemograma como base64 DENTRO de
-- exam_result_graphs.data (~6,5 kB por curva, ~45 kB por exame). Toda abertura
-- do laudo arrastava esses 45 kB do Postgres através da função serverless —
-- exatamente o tráfego que a Vercel cobra como "fast origin transfer" e que
-- derrubou a conta por FAIR_USE_LIMITS_EXCEEDED.
--
-- Agora: o PNG binário vive no bucket privado `exam-graphs` e a tabela guarda
-- só o caminho + metadados. O laudo recebe uma signed URL e o NAVEGADOR busca
-- a imagem direto no Storage do Supabase — não passa pela nossa função.
--
-- Retrocompatível: `data` continua existindo (agora NULL-ável). Linhas antigas
-- com base64 seguem renderizando pelo fallback no leitor; o script
-- scripts/migrate-exam-graphs-to-storage.mjs move as antigas quando rodar.
--
-- Aditiva e idempotente.

BEGIN;

-- 1) Bucket PRIVADO das curvas.
--    Privado (e não público) porque a curva é dado de exame de um Pet: está
--    vinculada ao atendimento e, somada ao laudo, identifica Pet/Tutor. Acesso
--    só por signed URL emitida pelo servidor depois de checar clinic_id.
--    Sem política para `authenticated`/`anon` → nada de listagem nem leitura
--    direta via PostgREST/Storage API; só service_role (mediado pelo server).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exam-graphs', 'exam-graphs', false, 2097152,
  ARRAY['image/png','image/bmp','image/jpeg','image/gif','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2) Metadados do objeto no lugar do payload.
ALTER TABLE exam_result_graphs ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE exam_result_graphs ADD COLUMN IF NOT EXISTS bytes        integer;
ALTER TABLE exam_result_graphs ADD COLUMN IF NOT EXISTS width        integer;
ALTER TABLE exam_result_graphs ADD COLUMN IF NOT EXISTS height       integer;

COMMENT ON COLUMN exam_result_graphs.storage_path IS
  'Caminho no bucket exam-graphs: {clinic_id}/{consultation_id}/{curva}.png';
COMMENT ON COLUMN exam_result_graphs.data IS
  'LEGADO: base64 da curva. Só nas linhas gravadas antes da 0487 (fallback do leitor).';

-- 3) `data` deixa de ser obrigatório — nas linhas novas o payload está no Storage.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_result_graphs'
      AND column_name = 'data' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE exam_result_graphs ALTER COLUMN data DROP NOT NULL;
  END IF;
END $$;

-- 4) Uma curva precisa ter ONDE estar: Storage (novo) ou base64 (legado).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exam_result_graphs_payload_present'
      AND conrelid = 'public.exam_result_graphs'::regclass
  ) THEN
    ALTER TABLE exam_result_graphs
      ADD CONSTRAINT exam_result_graphs_payload_present
      CHECK (storage_path IS NOT NULL OR data IS NOT NULL);
  END IF;
END $$;

-- 5) Varredura das pendentes de migração (base64 ainda sem storage_path).
CREATE INDEX IF NOT EXISTS idx_exam_result_graphs_pending_migration
  ON exam_result_graphs (clinic_id)
  WHERE storage_path IS NULL;

COMMIT;
