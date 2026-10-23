-- 0515 — Notas emitidas contra o CNPJ da empresa, vindas da SEFAZ.
--
-- É o que responde à pergunta da Aline: "quais notas foram emitidas contra a
-- gente?". Hoje a resposta depende de o fornecedor lembrar de mandar o XML por
-- e-mail; quando ele esquece, a entrada é digitada à mão.
--
-- `chave` é a identidade: 44 dígitos atribuídos pela SEFAZ, únicos por nota.
-- É por ela que o sistema sabe dizer "esta já foi lançada" — `purchase_orders`
-- guarda a mesma chave em `nfe_key`.
--
-- O XML fica em coluna TEXT, não no Storage: uma NF-e tem dezenas de KB, e o
-- volume de uma clínica são centenas por mês. Storage traria signed URL,
-- expiração e um segundo lugar para o dado sumir, sem ganho nenhum nessa
-- escala.
--
-- `xml` é ANULÁVEL de propósito, e isso é o centro do fluxo: enquanto não há
-- manifestação de Ciência (210210), a SEFAZ entrega apenas o RESUMO — chave,
-- emitente, valor, data. O XML completo só vem depois, e é ele que permite
-- lançar a entrada. Por isso a tela precisa distinguir "sei que esta nota
-- existe" de "tenho o arquivo dela".

CREATE TABLE IF NOT EXISTS dfe_documentos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        NOT NULL REFERENCES clinics(id)   ON DELETE CASCADE,
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  chave           TEXT        NOT NULL,
  /** NSU em que o documento chegou. Nulo quando veio por consulta de chave. */
  nsu             TEXT,
  /** 'resumo' | 'completo' | 'evento' — o que temos nas mãos. */
  tipo            TEXT        NOT NULL DEFAULT 'resumo',
  /** 'nsu' | 'chave' — por onde chegou, útil para entender a cobertura. */
  origem          TEXT        NOT NULL DEFAULT 'nsu',

  emitente_cnpj   TEXT,
  emitente_nome   TEXT,
  numero          TEXT,
  serie           TEXT,
  valor           NUMERIC(14,2),
  emitida_em      TIMESTAMPTZ,
  /** Situação da nota na SEFAZ (autorizada, cancelada…). */
  situacao        TEXT,

  /** O XML completo, quando já liberado. Nulo = só temos o resumo. */
  xml             TEXT,

  /** Manifestação registrada por nós. */
  manifestado_em  TIMESTAMPTZ,
  manifestacao    TEXT,

  /** Preenchido quando a nota vira entrada de compra. */
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  lancado_em      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dfe_chave_44 CHECK (chave ~ '^[0-9]{44}$')
);

-- A nota é única na clínica. Chegar duas vezes (pelo NSU e pela chave) deve
-- atualizar a mesma linha, não criar outra — por isso COLUNAS simples no
-- índice, que é o que o upsert consegue casar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dfe_documentos_chave
  ON dfe_documentos (clinic_id, chave);

CREATE INDEX IF NOT EXISTS idx_dfe_documentos_empresa
  ON dfe_documentos (company_id, emitida_em DESC);

-- Para o filtro "ainda não lançadas", que é como a tela abre.
CREATE INDEX IF NOT EXISTS idx_dfe_documentos_pendentes
  ON dfe_documentos (clinic_id, emitida_em DESC)
  WHERE purchase_order_id IS NULL;

ALTER TABLE dfe_documentos ENABLE ROW LEVEL SECURITY;
-- RLS ligada e sem policy: acesso só pelo service role, dentro das actions.

COMMENT ON COLUMN dfe_documentos.xml IS
  'XML completo. Nulo enquanto houver apenas o resumo — a SEFAZ só libera o arquivo após a manifestação de Ciência.';
