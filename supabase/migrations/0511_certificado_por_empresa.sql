-- 0511 — Um certificado e-CNPJ por EMPRESA FATURANTE, não um por clínica.
--
-- A 0490 criou `uq_clinic_bank_certificates (clinic_id, bank_code)`: um único
-- certificado por banco dentro da clínica. A Animais tem três CNPJs operando
-- no mesmo banco (756), cada um com seu e-CNPJ A1 — ao subir o segundo, o
-- upsert SOBRESCREVIA o primeiro em silêncio, e a integração passava a
-- apresentar o certificado errado ao Sicoob.
--
-- `company_id` fica ANULÁVEL de propósito, com duas semânticas:
--   * preenchido → certificado daquela empresa faturante;
--   * nulo       → certificado "da clínica", herdado por quem ainda não tem o
--                  seu. É o que existe hoje em produção, onde o certificado
--                  cadastrado (CNPJ 02.154.085/0001-98) não corresponde a
--                  nenhuma das empresas já cadastradas — exigir a empresa
--                  agora invalidaria a única credencial em uso.
--
-- Por isso NÃO há upsert por ON CONFLICT nesta tabela: NULL nunca conflita com
-- NULL, e um upsert por (clinic_id, bank_code, company_id) criaria uma linha
-- nova a cada envio do certificado da clínica. A action faz SELECT e então
-- UPDATE ou INSERT. Os índices abaixo existem para integridade, não para o
-- ON CONFLICT — mesma lição da 0510, onde um índice que o upsert não casava
-- fazia a gravação falhar inteira.

ALTER TABLE clinic_bank_certificates
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Quem já tem CNPJ igual ao de uma empresa cadastrada migra sozinho: é
-- seguramente o certificado daquela empresa.
UPDATE clinic_bank_certificates c
   SET company_id = co.id
  FROM companies co
 WHERE co.clinic_id = c.clinic_id
   AND c.company_id IS NULL
   AND regexp_replace(COALESCE(c.cnpj,  ''), '\D', '', 'g') <> ''
   AND regexp_replace(COALESCE(co.cnpj, ''), '\D', '', 'g')
     = regexp_replace(COALESCE(c.cnpj,  ''), '\D', '', 'g');

DROP INDEX IF EXISTS uq_clinic_bank_certificates;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_por_empresa
  ON clinic_bank_certificates (clinic_id, bank_code, company_id)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_da_clinica
  ON clinic_bank_certificates (clinic_id, bank_code)
  WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cert_company
  ON clinic_bank_certificates (company_id)
  WHERE company_id IS NOT NULL;
