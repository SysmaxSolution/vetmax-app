-- Migration 0101: Torna campos do tutor opcionais
-- Cenário: terceiro leva o pet; veterinário preenche dados do tutor depois.

ALTER TABLE tutors ALTER COLUMN name  DROP NOT NULL;
ALTER TABLE tutors ALTER COLUMN cpf   DROP NOT NULL;
ALTER TABLE tutors ALTER COLUMN phone DROP NOT NULL;

COMMENT ON COLUMN tutors.name  IS 'Nome do tutor — pode ser nulo quando não informado no cadastro inicial';
COMMENT ON COLUMN tutors.cpf   IS 'CPF do tutor (só dígitos) — quando nulo, múltiplos tutors sem CPF são permitidos na mesma clínica';
COMMENT ON COLUMN tutors.phone IS 'Celular do tutor — pode ser nulo quando não informado no cadastro inicial';
