-- 0434: código de acesso da clínica (segurança do cadastro). Remove a adesão por
-- busca pública; para entrar numa clínica existente, o admin passa este código.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS join_code text;
UPDATE clinics SET join_code = upper(substr(md5(gen_random_uuid()::text), 1, 8)) WHERE join_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_clinics_join_code ON clinics(join_code) WHERE join_code IS NOT NULL;
