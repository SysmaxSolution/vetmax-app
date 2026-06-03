-- Intervencao Cirurgica — campo de especialidade do profissional.
--
-- O cabecalho de laudos veterinarios geralmente tem:
--   Linha 1: "Dr. Fulano"                        → professional_name
--   Linha 2: "Medico Veterinario – Cardiologo"   → role + especialidade
--   Linha 3: "CRMV-SP 74.696"                    → professional_crmv
--
-- O cargo (role) ja vem do enum profiles.role ('vet', 'admin'...). A
-- especialidade NAO existia no schema — adicionamos agora como string livre.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS specialty text;

COMMENT ON COLUMN profiles.specialty IS
  'Especialidade do profissional (ex: Cardiologista, Dermatologista). '
  'Aparece em laudos no formato "Medico Veterinario – {especialidade}".';
