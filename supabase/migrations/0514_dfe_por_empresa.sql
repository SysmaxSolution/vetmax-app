-- 0514 — Distribuição DF-e por empresa faturante: configuração e estado do NSU.
--
-- Guarda duas coisas que não podem viver separadas:
--
--   1. O que a clínica QUER (consultar automaticamente? manifestar ciência
--      automaticamente?). Cada empresa decide por si: são CNPJs distintos, e
--      a manifestação é a assinatura digital daquele CNPJ sendo usada numa
--      declaração fiscal.
--
--   2. Onde a sincronização PAROU (`ult_nsu`). Isto não é cache: a NT 2014.002
--      controla a sequência de NSU POR CNPJ, não por aplicação. Consultar a
--      partir de um NSU já entregue — ainda que entregue a OUTRO software, como
--      o da contabilidade — é uso indevido, e o bloqueio de 1 hora cai sobre o
--      CNPJ, atingindo os dois. Por isso o ponteiro é único por empresa e só
--      anda para a frente.
--
-- `bloqueado_ate` é o disjuntor. Ao receber cStat 656, ou 137 (nada novo), a
-- próxima consulta fica proibida por uma hora. A regra oficial é implacável:
-- quem consulta antes do prazo tem o relógio ZERADO e recomeça a punição. Era
-- preciso um lugar para gravar isso — não dá para confiar que a rotina "vai
-- lembrar" entre execuções.

CREATE TABLE IF NOT EXISTS company_dfe (
  company_id      UUID        PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  clinic_id       UUID        NOT NULL    REFERENCES clinics(id)   ON DELETE CASCADE,

  /** Consultar a SEFAZ automaticamente. Padrão desligado. */
  enabled         BOOLEAN     NOT NULL DEFAULT false,

  /**
   * Manifestar Ciência da Operação (210210) automaticamente.
   *
   * Separado de `enabled` de propósito: consultar é leitura; manifestar é
   * assinar com o certificado da empresa. Ligar um não pode ligar o outro.
   */
  auto_ciencia    BOOLEAN     NOT NULL DEFAULT false,

  /** Onde a sincronização parou. Só anda para a frente. */
  ult_nsu         BIGINT      NOT NULL DEFAULT 0,
  /** Maior NSU que a SEFAZ informou existir — diz se estamos atrasados. */
  max_nsu         BIGINT      NOT NULL DEFAULT 0,

  ultima_consulta TIMESTAMPTZ,
  ultimo_sucesso  TIMESTAMPTZ,

  /** Disjuntor: antes disto, NÃO consultar. Ver cStat 137 e 656. */
  bloqueado_ate   TIMESTAMPTZ,
  /** Quantas vezes caímos em consumo indevido. Recorrência = outro consumidor. */
  bloqueios       INTEGER     NOT NULL DEFAULT 0,

  situacao        TEXT        NOT NULL DEFAULT 'ok',
  /** Só para suporte. Nunca exibir ao operador. */
  erro_tecnico    TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dfe_nsu_nao_retrocede CHECK (ult_nsu >= 0 AND max_nsu >= 0)
);

ALTER TABLE company_dfe ENABLE ROW LEVEL SECURITY;
-- RLS ligada e sem policy: todo acesso passa pelo service role, dentro das
-- server actions. Mesma postura das demais tabelas de integração.

CREATE INDEX IF NOT EXISTS idx_company_dfe_clinica
  ON company_dfe (clinic_id) WHERE enabled = true;

COMMENT ON COLUMN company_dfe.ult_nsu IS
  'Sequência de NSU é controlada POR CNPJ pela SEFAZ (NT 2014.002). Nunca retroceder.';
COMMENT ON COLUMN company_dfe.erro_tecnico IS
  'Mensagem crua da SEFAZ, para suporte. Nunca exibir ao operador.';
