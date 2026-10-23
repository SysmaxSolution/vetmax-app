-- 0513 — Estado da varredura automática do DDA, por conta bancária.
--
-- O PAGFOR deixa de depender de alguém escolher um período e clicar: uma
-- rotina diária traz os boletos de cada conta e a tela passa a ler o que já
-- está guardado.
--
-- Esta tabela existe por causa de uma regra do projeto: rotina automática que
-- falha em silêncio é pior do que rotina nenhuma. Sem ela, a tela mostraria
-- uma lista parada há duas semanas com a mesma cara de uma lista atualizada
-- hoje, e o operador deixaria de pagar o que não aparece.
--
-- `erro_tecnico` NUNCA vai para a tela do operador. A tela mostra há quanto
-- tempo a conta foi atualizada e, quando falha, uma frase curta; o detalhe
-- fica aqui para quem dá suporte.

CREATE TABLE IF NOT EXISTS dda_varreduras (
  clinic_id        UUID        NOT NULL REFERENCES clinics(id)       ON DELETE CASCADE,
  bank_account_id  UUID        NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,

  ultima_tentativa TIMESTAMPTZ,
  ultimo_sucesso   TIMESTAMPTZ,

  /** 'ok' | 'erro' — o suficiente para a tela decidir o que dizer. */
  situacao         TEXT        NOT NULL DEFAULT 'ok',

  /** Quantos vieram na última varredura bem-sucedida. */
  encontrados      INTEGER     NOT NULL DEFAULT 0,
  novos            INTEGER     NOT NULL DEFAULT 0,

  /** Só para suporte. Não exibir ao operador. */
  erro_tecnico     TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (clinic_id, bank_account_id)
);

ALTER TABLE dda_varreduras ENABLE ROW LEVEL SECURITY;

-- RLS ligada e sem policy: todo acesso passa pelo service role, dentro das
-- server actions. Mesma postura de clinic_bank_certificates — a tabela guarda
-- diagnóstico de integração, que não precisa estar ao alcance da chave anônima.

CREATE INDEX IF NOT EXISTS idx_dda_varreduras_clinica
  ON dda_varreduras (clinic_id, ultimo_sucesso DESC);

COMMENT ON COLUMN dda_varreduras.erro_tecnico IS
  'Mensagem crua da integração, para suporte. Nunca exibir ao operador.';
