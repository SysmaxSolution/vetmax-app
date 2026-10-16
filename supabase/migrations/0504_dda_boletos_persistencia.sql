-- 0504: guarda os boletos do DDA, para a rotina do PAGFOR não perder trabalho.
--
-- Hoje a varredura do DDA vive só no estado do React. Quem consulta o período,
-- lança metade dos boletos, é interrompido e volta depois, **perde tudo** —
-- precisa consultar de novo, e a tela não sabe o que já foi tratado. É o mesmo
-- buraco que a conciliação bancária tinha antes de `bank_statements`.
--
-- A regra pedida pelo Diretor é a da conciliação: ao escolher o período, o
-- sistema lê o que já está guardado, complementa com o que o banco trouxer de
-- novo, e só consulta o banco quando não há nada guardado. O que o operador já
-- resolveu continua resolvido.
--
-- IDEMPOTÊNCIA — `fingerprint`, mesma lição de `extrato-digital.ts`:
-- em produção a conciliação chegou a ter 150 linhas com 43 grupos duplicados
-- porque reimportar o mesmo período criava cópias. Aqui a digital prefere o
-- identificador que o PRÓPRIO banco dá:
--
--   1. `numeroIdentificadorBoletoCip` — id do boleto na CIP, único de verdade.
--   2. `numeroCodigoBarras` — chave natural do boleto quando não vier o CIP.
--   3. hash do conteúdo, como último recurso (import por CSV).
--
-- O ESTADO DO TRABALHO fica na própria linha, não numa sessão:
--   `entry_id`/`launched_at` — já virou título a pagar;
--   `dismissed_at`/`dismissed_reason` — o operador marcou para ignorar. Hoje
--   "ignorar" é local à sessão e some ao recarregar, o que faz o mesmo boleto
--   voltar a pedir atenção todo dia.
--
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS dda_boletos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  bank_account_id   UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,

  -- identidade
  fingerprint       TEXT NOT NULL,
  barcode           TEXT,
  document          TEXT,

  -- beneficiário (o fornecedor)
  beneficiary       TEXT,
  beneficiary_doc   TEXT,

  -- título
  amount            NUMERIC(14,2),
  due_date          DATE,
  issue_date        DATE,
  situacao          TEXT,            -- descricaoSituacaoBoleto do banco

  -- resposta crua: o banco acrescenta campo sem avisar, e reprocessar sem ter
  -- guardado o original significa consultar de novo.
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- estado do trabalho do operador
  entry_id          UUID REFERENCES financial_entries(id) ON DELETE SET NULL,
  launched_at       TIMESTAMPTZ,
  dismissed_at      TIMESTAMPTZ,
  dismissed_reason  TEXT,

  imported_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reimportar o mesmo período não duplica: é a trava que faltou na conciliação.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_dda_boletos_digital
  ON dda_boletos (clinic_id, fingerprint);

-- A busca da tela é sempre por clínica + janela de vencimento.
CREATE INDEX IF NOT EXISTS idx_dda_boletos_periodo
  ON dda_boletos (clinic_id, due_date);

-- O que ainda pede atenção: nem lançado, nem ignorado.
CREATE INDEX IF NOT EXISTS idx_dda_boletos_pendentes
  ON dda_boletos (clinic_id, due_date)
  WHERE entry_id IS NULL AND dismissed_at IS NULL;

ALTER TABLE dda_boletos ENABLE ROW LEVEL SECURITY;
-- Zero políticas: nega tudo a anon e authenticated. Quem lê é o service_role
-- das server actions, que ignora RLS — mesmo desenho das demais tabelas
-- financeiras sensíveis.
REVOKE ALL ON TABLE dda_boletos FROM anon;

COMMENT ON COLUMN dda_boletos.fingerprint IS
  'Identidade do boleto para não duplicar ao reimportar: cip:<numeroIdentificadorBoletoCip>, '
  'senão cb:<codigoBarras>, senão hash do conteúdo. Ver src/lib/financial/dda-digital.ts.';
COMMENT ON COLUMN dda_boletos.dismissed_at IS
  'Operador marcou para ignorar. Persistido de propósito: antes era local à sessão e o '
  'mesmo boleto voltava a pedir atenção a cada recarga.';
