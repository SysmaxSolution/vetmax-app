-- =============================================================================
-- VetMax — Migration 0171: clinics ganha endereço estruturado
--
-- Adiciona campos próprios para Cidade, Estado (UF), CEP e Bairro. Antes
-- esses dados eram extraídos heuristicamente de:
--   - cnpj_data.municipio / cnpj_data.uf (quando o admin tinha CNPJ
--     cadastrado e a API ReceitaWS retornou os campos)
--   - parse do address (text livre, frágil)
--
-- A coluna address continua para retro-compatibilidade — pode ser usada
-- como endereço completo quando os campos estruturados não estão preenchidos.
-- IDEMPOTENTE.
-- =============================================================================

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS neighborhood text;

COMMENT ON COLUMN clinics.city         IS 'Cidade da clínica (ex: "Ribeirão Preto"). Preferência sobre cnpj_data.municipio.';
COMMENT ON COLUMN clinics.state        IS 'UF (2 chars maiúsculas, ex: "SP"). Preferência sobre cnpj_data.uf.';
COMMENT ON COLUMN clinics.cep          IS 'CEP em formato livre (ex: "14010-000" ou "14010000").';
COMMENT ON COLUMN clinics.neighborhood IS 'Bairro / distrito (ex: "Pres. Medici").';
