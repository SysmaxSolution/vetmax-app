-- 0447 — Identidade do Portal do Tutor (Fase 3).
--
-- O tutor é, no schema atual, uma linha em `tutors` SOB `clinic_id` (o mesmo CPF
-- pode ser tutor em várias clínicas → 1:N). Para o portal, uma PESSOA faz login e
-- precisa ver seus pets em TODAS as clínicas onde é tutor, sem vazar entre clínicas.
--
-- Decisão (council 08/09): NÃO reaproveitar profiles/get_user_clinic_id() (quebraria
-- o isolamento da equipe). Cria-se uma identidade de portal separada:
--   tutor_users         — a pessoa (1 por CPF/telefone)
--   tutor_user_links     — ponte N:N pessoa ↔ tutor(clínica), criada na verificação
--   tutor_login_tokens   — link mágico enviado por WhatsApp (uso único, expira)
--   tutor_sessions       — sessão do portal (cookie HttpOnly), revogável
--
-- O portal NÃO usa Supabase Auth para o tutor: o acesso é mediado por server
-- actions com admin client que filtram ESTRITAMENTE pelos (tutor_id, clinic_id)
-- vinculados — mesmo padrão das páginas públicas atuais (public-data.ts). Por isso
-- estas tabelas ficam com RLS habilitada e SEM policy (só service_role acessa).
-- Aditiva + idempotente.

BEGIN;

-- ── A pessoa (identidade de portal) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tutor_users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf        text,                 -- só dígitos (normalizado); pode ser nulo
  phone      text,                 -- só dígitos; canal de login (WhatsApp)
  full_name  text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tutor_users_cpf   ON tutor_users (cpf);
CREATE INDEX IF NOT EXISTS idx_tutor_users_phone ON tutor_users (phone);

-- ── Ponte pessoa ↔ tutor(clínica) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tutor_user_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_user_id uuid NOT NULL REFERENCES tutor_users(id) ON DELETE CASCADE,
  tutor_id      uuid NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  clinic_id     uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  linked_via    text NOT NULL DEFAULT 'reception_invite',  -- 'reception_invite' | 'self_cpf' | 'otp_whatsapp'
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tutor_user_id, tutor_id)
);
CREATE INDEX IF NOT EXISTS idx_tutor_user_links_user  ON tutor_user_links (tutor_user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_user_links_tutor ON tutor_user_links (tutor_id);

-- ── Link mágico (WhatsApp) — uso único ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tutor_login_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_user_id uuid NOT NULL REFERENCES tutor_users(id) ON DELETE CASCADE,
  clinic_id     uuid REFERENCES clinics(id) ON DELETE SET NULL,  -- clínica que convidou
  token         text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tutor_login_tokens_token ON tutor_login_tokens (token);

-- ── Sessão do portal (cookie) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tutor_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_user_id uuid NOT NULL REFERENCES tutor_users(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tutor_sessions_token ON tutor_sessions (session_token);

-- RLS habilitada, SEM policy → apenas service_role (server/admin client) acessa.
ALTER TABLE tutor_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_user_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_login_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_sessions     ENABLE ROW LEVEL SECURITY;

COMMIT;
