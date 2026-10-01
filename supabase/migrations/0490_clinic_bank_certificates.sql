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

-- Sem policy de leitura para o usuário comum: o certificado só é lido pelo
-- service role, dentro das Server Actions. A tela recebe apenas metadados.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='clinic_bank_certificates'
       AND policyname='clinic_bank_certificates_tenant'
  ) THEN
    CREATE POLICY clinic_bank_certificates_tenant ON clinic_bank_certificates
      FOR ALL
      USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

COMMENT ON COLUMN clinic_bank_certificates.pfx_encrypted IS
  'e-CNPJ A1 cifrado com AES-256-GCM. Nunca trafega para o cliente.';
