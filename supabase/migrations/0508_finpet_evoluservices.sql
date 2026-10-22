-- =============================================================================
-- VetMax — Migration 0508: integração FinPet / EvoluServices (cartão)
--
-- CONTEXTO
-- --------
-- FinPet é a adquirente da CLÍNICA para cobrar TUTORES — não confundir com o
-- Asaas, que é a mensalidade do SYSVETMAX. Na Clínica Animais a regra é POR
-- CNPJ, confirmada com a Aline: a Develey (Diagnóstico/Imagem) usa FinPet com
-- split do profissional; Laboratório e Clínica usam Sipag própria.
--
-- Daí a decisão central deste schema: a configuração é POR EMPRESA FATURANTE
-- (`companies`, migration 0421), não por clínica. No caixa, a máquina é escolhida
-- pela empresa do item — é assim que a recepção já trabalha hoje.
--
-- A DOR QUE ISTO RESOLVE
-- ----------------------
-- Hoje a recepção passa o valor cheio na FinPet da Develey e a Bruna splita a
-- comissão do MV terceirizado no portal, venda por venda e parcela por parcela
-- (débito no mesmo dia; parcelado de 15 em 15 dias). Os relatórios não separam o
-- split: R$ 1.600 aparecem como se fossem todos da Develey, o que não é verdade.
--
-- O `splits[]` da API aplica no ato da venda e vale para TODAS as parcelas, e o
-- callback devolve `payments[]` e `splits[]` parcela a parcela, com data, nome e
-- documento do beneficiário. Não precisamos reconstruir rateio: basta persistir
-- o que vem — e é isso que estas tabelas guardam.
--
-- DECISÕES DE SEGURANÇA
-- ---------------------
--   * As credenciais são DO ESTABELECIMENTO, não nossas (a própria doc manda o
--     parceiro criar tela para o cliente colar a chave). Vão cifradas em
--     AES-256-GCM, pelo mesmo caminho do certificado do Sicoob, e NUNCA no
--     repositório.
--   * RLS ligado com ZERO políticas nas tabelas de credencial: nega tudo para
--     `anon` e `authenticated`; quem lê é o service_role das server actions.
--     Mesmo desenho da 0490 (certificados bancários).
--   * O webhook deles NÃO TEM ASSINATURA (sem HMAC, sem segredo documentado).
--     Guardamos um segredo por empresa no caminho da URL e, além disso, toda
--     baixa de título confirma por consulta à API antes de valer. Sem isso,
--     quem descobrisse a URL forjaria baixa de título.
--
-- MEDIDO NO SANDBOX EM 22/10/2026 (não suposto)
-- ---------------------------------------------
--   * o `apiKey` da doc é a SENHA entregue por e-mail; o UUID entregue é o
--     `merchantId`/`merchantCode` — e o mesmo valor serve nos dois lugares;
--   * o token é JWT e expira em 7.948.800 s (92 dias) — a doc não publica isso;
--   * `POST /api/orders` responde `{uuid, payUrl, reference, status}` — a doc
--     não documenta a resposta, e o campo da URL é `payUrl`;
--   * o status inicial do link é `PENDING`, que NÃO consta da tabela de status
--     publicada. Por isso nenhuma coluna de status aqui tem CHECK fechado.
--
-- Aditiva e idempotente.
-- =============================================================================

BEGIN;

-- ─── 1. configuração por empresa faturante ──────────────────────────────────

CREATE TABLE IF NOT EXISTS company_card_acquirer (
  company_id          UUID        PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  clinic_id           UUID        NOT NULL REFERENCES clinics(id)      ON DELETE CASCADE,

  /** Qual adquirente esta empresa usa. A Animais tem FinPet numa e Sipag nas
   *  outras duas, e é isso que decide a máquina no caixa. */
  acquirer            TEXT        NOT NULL DEFAULT 'evoluservices',

  enabled             BOOLEAN     NOT NULL DEFAULT FALSE,
  /** 'sandbox' enquanto a homologação não termina; 'production' depois. */
  environment         TEXT        NOT NULL DEFAULT 'sandbox',

  /** Identificador do estabelecimento na EvoluServices (UUID). Vai no
   *  `merchantId` do corpo da transação e no `merchantCode` da URL — medido:
   *  é o mesmo valor nos dois. */
  merchant_id         TEXT,
  /** Usuário da API, entregue por e-mail. */
  api_username        TEXT,
  /** A SENHA entregue por e-mail, que a doc chama de `apiKey`. Cifrada. */
  api_key_encrypted   TEXT,
  /** BasicAuth do Link de Pagamento, quando diferente do par acima. Cifrada. */
  basic_auth_encrypted TEXT,

  /** Segredo NOSSO no caminho do webhook — a EvoluServices não assina o
   *  callback. Um por empresa, para que vazar um não comprometa as outras. */
  webhook_secret      TEXT,

  /** Token em cache. Expira em 92 dias; renovamos sob 401 de todo jeito. */
  token_cache         TEXT,
  token_expires_at    TIMESTAMPTZ,

  /** Terminal preferido desta empresa. Sem ele a transação vira notificação nos
   *  aparelhos, o que não serve para pinpad com fio (não tem menu). */
  default_terminal_id TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE company_card_acquirer DROP CONSTRAINT IF EXISTS company_card_acquirer_acquirer_check;
ALTER TABLE company_card_acquirer ADD  CONSTRAINT company_card_acquirer_acquirer_check
  CHECK (acquirer IN ('evoluservices', 'sipag', 'outro'));

ALTER TABLE company_card_acquirer DROP CONSTRAINT IF EXISTS company_card_acquirer_environment_check;
ALTER TABLE company_card_acquirer ADD  CONSTRAINT company_card_acquirer_environment_check
  CHECK (environment IN ('sandbox', 'production'));

-- Ligar exige credencial completa. Sem este CHECK, alguém ativa a empresa com
-- campo em branco e a falha aparece na frente do tutor, no caixa.
ALTER TABLE company_card_acquirer DROP CONSTRAINT IF EXISTS company_card_acquirer_credencial_check;
ALTER TABLE company_card_acquirer ADD  CONSTRAINT company_card_acquirer_credencial_check
  CHECK (
    enabled = FALSE
    OR acquirer <> 'evoluservices'
    OR (merchant_id IS NOT NULL AND api_username IS NOT NULL
        AND api_key_encrypted IS NOT NULL AND webhook_secret IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_company_card_acquirer_clinic
  ON company_card_acquirer (clinic_id, enabled);
-- O webhook chega sem sessão: a busca é pelo segredo da URL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_card_acquirer_webhook
  ON company_card_acquirer (webhook_secret) WHERE webhook_secret IS NOT NULL;

ALTER TABLE company_card_acquirer ENABLE ROW LEVEL SECURITY;
-- Zero políticas de propósito: nega tudo para anon e authenticated. Quem lê é o
-- service_role, que ignora RLS. Mesmo desenho da 0490.
REVOKE ALL ON TABLE company_card_acquirer FROM anon;

COMMENT ON TABLE company_card_acquirer IS
  'Adquirente de cartao por EMPRESA FATURANTE (nao por clinica): na Animais a Develey usa FinPet com split e as outras duas usam Sipag. Credenciais cifradas em AES-256-GCM; RLS sem politica, acesso so pelo service_role.';
COMMENT ON COLUMN company_card_acquirer.api_key_encrypted IS
  'A senha entregue por e-mail, que a doc da EvoluServices chama de apiKey. Cifrada com encryptSecret (AES-256-GCM).';
COMMENT ON COLUMN company_card_acquirer.webhook_secret IS
  'Segredo nosso no caminho da URL de callback. A EvoluServices nao assina o webhook (sem HMAC documentado), entao este segredo + confirmacao por consulta a API sao a defesa contra baixa de titulo forjada.';

-- ─── 2. transações de cartão ────────────────────────────────────────────────
--
-- Uma linha por cobrança, seja na maquininha ou por link. O callback é
-- reentregue a cada mudança de estado, então a chave de conflito é o número da
-- transação deles — upsert, nunca insert.

CREATE TABLE IF NOT EXISTS card_transactions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID          NOT NULL REFERENCES clinics(id)   ON DELETE CASCADE,
  company_id          UUID          REFERENCES companies(id)          ON DELETE SET NULL,

  /** 'remote' = maquininha; 'link' = link de pagamento. */
  kind                TEXT          NOT NULL,

  /** Nosso identificador, mandado como `reference` — é por ele que a conciliação
   *  encontra a venda quando o callback chega sem mais contexto. */
  reference           TEXT          NOT NULL,

  /** Identificadores deles. `transaction_number` é a chave natural do callback. */
  transaction_id      TEXT,
  transaction_number  TEXT,
  order_uuid          TEXT,
  pay_url             TEXT,

  /** Status cru deles, SEM CHECK: a doc avisa que há status internos
   *  "extremamente voláteis", e o `PENDING` que medimos no sandbox não está nem
   *  na tabela publicada. Traduzir é problema da camada de leitura. */
  status              TEXT,

  amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  installments        INTEGER,
  payment_brand       TEXT,
  terminal_id         TEXT,
  nsu                 TEXT,
  authorization_number TEXT,

  /** A quem a cobrança se refere, quando houver. */
  consultation_id     UUID          REFERENCES consultations(id)      ON DELETE SET NULL,
  tutor_id            UUID          REFERENCES tutors(id)             ON DELETE SET NULL,
  financial_entry_id  UUID          REFERENCES financial_entries(id)  ON DELETE SET NULL,

  /** Callback cru, para auditoria e reprocessamento. */
  last_callback       JSONB,
  callback_count      INTEGER       NOT NULL DEFAULT 0,

  created_by          UUID          REFERENCES profiles(id)           ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE card_transactions DROP CONSTRAINT IF EXISTS card_transactions_kind_check;
ALTER TABLE card_transactions ADD  CONSTRAINT card_transactions_kind_check
  CHECK (kind IN ('remote', 'link'));

-- Chave do upsert do callback. Parcial porque o número só existe depois que
-- eles respondem.
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_transactions_numero
  ON card_transactions (clinic_id, transaction_number)
  WHERE transaction_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_transactions_referencia
  ON card_transactions (clinic_id, reference);
CREATE INDEX IF NOT EXISTS idx_card_transactions_clinic_data
  ON card_transactions (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_transactions_consulta
  ON card_transactions (consultation_id) WHERE consultation_id IS NOT NULL;

ALTER TABLE card_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_card_transactions" ON card_transactions;
CREATE POLICY "clinic_isolation_card_transactions"
  ON card_transactions FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
REVOKE ALL ON TABLE card_transactions FROM anon;

COMMENT ON TABLE card_transactions IS
  'Cobrancas de cartao pela EvoluServices (maquininha ou link). O callback e reentregue a cada mudanca de estado, entao a gravacao e upsert por (clinic_id, transaction_number).';

-- ─── 3. parcelas e splits, como o callback entrega ──────────────────────────
--
-- É a peça que resolve o "contábil não reflete a realidade" da Aline: o retorno
-- já diz, parcela a parcela, quanto foi para a clínica e quanto foi para o
-- profissional, com data. Guardamos exatamente isso.

CREATE TABLE IF NOT EXISTS card_transaction_payments (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID          NOT NULL REFERENCES clinics(id)           ON DELETE CASCADE,
  card_transaction_id UUID          NOT NULL REFERENCES card_transactions(id) ON DELETE CASCADE,

  /** 'merchant' = parcela do estabelecimento; 'split' = parte do beneficiário. */
  kind                TEXT          NOT NULL,
  /** Número da parcela, como vem em `payments[].number` / `splits[].number`. */
  number              INTEGER       NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  /** Status cru deles (PAYED, UNPAID, ANTICIPATED…), sem CHECK. */
  status              TEXT,
  /** `date` do callback: data estimada ou efetiva do crédito. */
  pay_date            DATE,
  recipient_name      TEXT,
  recipient_document  TEXT,

  /** Profissional a quem o split pertence, quando conseguimos amarrar pelo
   *  código do beneficiário. NULL não é erro: pode ser um beneficiário que a
   *  clínica cadastrou no portal deles e não no nosso. */
  professional_id     UUID          REFERENCES profiles(id)                   ON DELETE SET NULL,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE card_transaction_payments DROP CONSTRAINT IF EXISTS card_transaction_payments_kind_check;
ALTER TABLE card_transaction_payments ADD  CONSTRAINT card_transaction_payments_kind_check
  CHECK (kind IN ('merchant', 'split'));

-- O callback repete: a mesma parcela chega várias vezes com status diferente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_transaction_payments
  ON card_transaction_payments (card_transaction_id, kind, number, coalesce(recipient_document, ''));
CREATE INDEX IF NOT EXISTS idx_card_transaction_payments_data
  ON card_transaction_payments (clinic_id, pay_date);

ALTER TABLE card_transaction_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_card_transaction_payments" ON card_transaction_payments;
CREATE POLICY "clinic_isolation_card_transaction_payments"
  ON card_transaction_payments FOR ALL TO authenticated
  USING      (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM profiles WHERE id = auth.uid()));
REVOKE ALL ON TABLE card_transaction_payments FROM anon;

COMMENT ON TABLE card_transaction_payments IS
  'Parcelas do estabelecimento e do split, parcela a parcela, como o callback da EvoluServices entrega (com data, nome e documento do beneficiario). E o que faz o contabil refletir a realidade: a parte do profissional vai direta a ele e nao passa pela conta da clinica.';

-- ─── 4. código do beneficiário no cadastro do profissional ──────────────────
--
-- O beneficiário do split é cadastrado no portal DELES por formulário, com
-- duplo consentimento (o estabelecimento aceita o fornecedor e o fornecedor
-- aceita o vínculo) — não há API para criar. O que guardamos é o código que
-- eles geram, para mandar no `splits[]`.
--
-- TEXTO, não numérico: a doc valida `[0-9]+` na transação remota, mas os três
-- exemplos da própria documentação usam códigos alfanuméricos ("PGV1YN",
-- "NIGF01", "TYGF04"), inclusive no mesmo arquivo da validação.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS acquirer_recipient_code TEXT;

COMMENT ON COLUMN profiles.acquirer_recipient_code IS
  'Codigo do beneficiario deste profissional na adquirente (EvoluServices). Gerado no portal deles por formulario, com duplo consentimento. Vai no splits[].code da transacao. TEXTO: a doc valida [0-9]+ mas os proprios exemplos dela usam alfanumerico.';

COMMIT;
