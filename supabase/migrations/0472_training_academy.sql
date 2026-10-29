-- 0464 — Academia SYSVETMAX (plataforma de treinamento/implantação)
-- Conteúdo global (vídeos + quizzes) mantido pela Sysmax + progresso, tentativas,
-- reports e controle de acesso por módulo, por usuário/clínica.
-- Vídeos ficam em bucket PRIVADO `training-videos`; acesso só via signed URL server-side.

-- ── Catálogo de vídeos (conteúdo global) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_videos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key       TEXT NOT NULL,
  code             TEXT UNIQUE,                 -- ex.: aula-01
  title            TEXT NOT NULL,
  description      TEXT,
  storage_path     TEXT NOT NULL,               -- caminho no bucket privado
  duration_seconds INT  NOT NULL DEFAULT 0,
  sort_order       INT  NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_videos_mod ON training_videos (module_key, sort_order);

-- ── Perguntas de quiz por vídeo (conteúdo global) ────────────────────────────
CREATE TABLE IF NOT EXISTS training_quiz_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id      UUID NOT NULL REFERENCES training_videos(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  options       JSONB NOT NULL,                 -- array de strings
  correct_index INT  NOT NULL,
  explanation   TEXT,
  sort_order    INT  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_training_quiz_video ON training_quiz_questions (video_id, sort_order);

-- ── Progresso por usuário/clínica/vídeo ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id        UUID NOT NULL REFERENCES training_videos(id) ON DELETE CASCADE,
  watched_seconds INT  NOT NULL DEFAULT 0,
  watch_percent   INT  NOT NULL DEFAULT 0,
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_training_progress_user ON training_progress (clinic_id, profile_id);

-- ── Tentativas de quiz ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_quiz_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id      UUID NOT NULL REFERENCES training_videos(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES training_quiz_questions(id) ON DELETE CASCADE,
  chosen_index  INT  NOT NULL,
  is_correct    BOOLEAN NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_attempts_user ON training_quiz_attempts (clinic_id, profile_id, video_id);

-- ── Reports: pedido de vídeo novo OU problema num vídeo ───────────────────────
CREATE TABLE IF NOT EXISTS training_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  video_id    UUID REFERENCES training_videos(id) ON DELETE SET NULL,
  module_key  TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('request','bug')),
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_reports_clinic ON training_reports (clinic_id, status, created_at DESC);

-- ── Controle de acesso de treino por usuário/módulo ──────────────────────────
-- Sem linha para o par (usuário, módulo) = herda o acesso padrão (definido no app).
CREATE TABLE IF NOT EXISTS training_module_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  can_view    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, module_key)
);
CREATE INDEX IF NOT EXISTS idx_training_access_user ON training_module_access (clinic_id, profile_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE training_videos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_quiz_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_quiz_attempts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_module_access   ENABLE ROW LEVEL SECURITY;

-- Conteúdo global: leitura para autenticados; escrita só via service role.
DROP POLICY IF EXISTS training_videos_read ON training_videos;
CREATE POLICY training_videos_read ON training_videos
  FOR SELECT TO authenticated USING (is_active);
DROP POLICY IF EXISTS training_quiz_read ON training_quiz_questions;
CREATE POLICY training_quiz_read ON training_quiz_questions
  FOR SELECT TO authenticated USING (true);

-- Progresso/tentativas/reports/acesso: cada usuário só enxerga/escreve o SEU (profile_id = auth.uid()).
DROP POLICY IF EXISTS training_progress_own ON training_progress;
CREATE POLICY training_progress_own ON training_progress
  FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS training_attempts_own ON training_quiz_attempts;
CREATE POLICY training_attempts_own ON training_quiz_attempts
  FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS training_reports_own ON training_reports;
CREATE POLICY training_reports_own ON training_reports
  FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS training_access_own ON training_module_access;
CREATE POLICY training_access_own ON training_module_access
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
-- Nota: visões de gestor/admin (progresso de toda a clínica, reports, controle de acesso)
-- rodam server-side via service role, após checar que o solicitante é gestor da clínica.
