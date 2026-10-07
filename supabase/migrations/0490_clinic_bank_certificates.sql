-- 0490 — Certificado e-CNPJ A1 (mTLS) por clínica, para a integração bancária.
--
-- Por quê: a tela de Integrações Financeiras já coletava banco, ambiente,
-- client_id, agência e conta — mas não tinha onde colocar o certificado, e o
-- aviso "configuração no onboarding" não levava a lugar nenhum. Sem o
-- certificado o Sicoob recusa produção no próprio handshake TLS (HTTP 403
-- "Certificado digital e obrigatorio para este recurso").
--
-- O arquivo fica CIFRADO (AES-256-GCM, chave do servidor) e nunca volta para o
-- navegador — a tela só mostra metadados. É a mesma abordagem já usada para o
-- código de acesso do Portal (src/lib/portal/code-crypto.ts).

CREATE TABLE IF NOT EXISTS clinic_bank_certificates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL,
  -- '756' Sicoob, '341' Itaú… um certificado por banco dentro da clínica.
  bank_code     text NOT NULL DEFAULT '756',

  file_name     text,
  -- base64( iv | tag | ciphertext ) do .pfx e da senha.
  pfx_encrypted        text NOT NULL,
  passphrase_encrypted text,

  -- Metadados só para exibição/alerta. Preenchidos por quem sobe o arquivo;
  -- a validade real continua sendo a do certificado.
  subject_cn    text,
  cnpj          text,
  not_after     date,

  uploaded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_bank_certificates
  ON clinic_bank_certificates (clinic_id, bank_code);

ALTER TABLE clinic_bank_certificates ENABLE ROW LEVEL SECURITY;

-- RLS ligada e NENHUMA policy, de propósito.
--
-- A versão anterior criava uma policy `FOR ALL` para quem pertence à clínica.
-- `FOR ALL` inclui SELECT — ou seja, qualquer usuário logado da clínica podia
-- ler `pfx_encrypted` pelo PostgREST com a chave anônima. O comentário dizia
-- "sem policy de leitura para o usuário comum" e a policy fazia o contrário.
--
-- Não é necessária: TODO acesso à tabela passa pelo service role, dentro das
-- Server Actions de src/lib/actions/bank-certificates.ts (que leem apenas
-- bank_code, file_name, subject_cn, cnpj, not_after, created_at para a tela).
-- O service role ignora RLS. Sem policy, o PostgREST não devolve nada a
-- `anon` nem a `authenticated`, e a aplicação continua funcionando igual.
--
-- Se um dia a tela precisar ler metadados direto, criar uma policy
-- RESTRITA A SELECT e com lista de colunas via VIEW — nunca `FOR ALL` nesta
-- tabela, que guarda o certificado da empresa.
DO $$
BEGIN
  -- Remove a policy permissiva, caso o banco já a tenha da versão anterior.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='clinic_bank_certificates'
       AND policyname='clinic_bank_certificates_tenant'
  ) THEN
    DROP POLICY clinic_bank_certificates_tenant ON clinic_bank_certificates;
  END IF;
END $$;

REVOKE ALL ON clinic_bank_certificates FROM anon, authenticated;
GRANT  ALL ON clinic_bank_certificates TO service_role;

COMMENT ON COLUMN clinic_bank_certificates.pfx_encrypted IS
  'e-CNPJ A1 cifrado com AES-256-GCM. Nunca trafega para o cliente.';
