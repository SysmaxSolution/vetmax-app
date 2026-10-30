-- 0529 — CRMV como campo livre.
--
-- A CHECK `chk_crmv_format` exigia "UF + número" (ex.: SP28856). Na Clínica
-- Animais os profissionais escrevem o número primeiro e a sigla depois
-- ("28856-SP"), e cada um usa um jeito. A Aline pediu o campo livre: quem
-- assina o documento é quem sabe como o conselho dele registra.
--
-- Fica só um limite de tamanho, para o campo não virar texto solto.
-- Aditiva e idempotente.

BEGIN;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS chk_crmv_format;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS chk_crmv_tamanho;
ALTER TABLE profiles ADD CONSTRAINT chk_crmv_tamanho
  CHECK (crmv IS NULL OR char_length(btrim(crmv)) BETWEEN 2 AND 30);

COMMENT ON COLUMN profiles.crmv IS
  'Registro no CRMV, texto livre (ex.: "28856-SP", "CRMV-SP 28856"). Formato é escolha do profissional; o sistema só limita o tamanho.';

COMMIT;
