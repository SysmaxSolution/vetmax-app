-- 0494 — Importação de extrato idempotente: a mesma linha não entra duas vezes.
--
-- O problema, medido em PRODUÇÃO antes desta migration:
--   150 linhas em bank_statements, 43 grupos duplicados por conteúdo,
--   vários external_id com 3 cópias cada.
--
-- Causa: `importStatements` inseria às cegas, sem nenhuma checagem, e a tela
-- não recarregava o que já estava importado. O usuário consultava um período,
-- vinculava alguns títulos, saía da tela, voltava, reimportava o mesmo período
-- e ganhava cópias — inclusive de lançamento já conciliado, o que permitia
-- gerar vários títulos do mesmo movimento.
--
-- Por que NÃO dá para usar external_id como chave: ele guarda o
-- `numeroDocumento` do Sicoob, que para Pix vem como a string literal "Pix".
-- Em produção havia 51 linhas com external_id = 'Pix'. São 51 transações
-- DIFERENTES; uma chave única ali apagaria 50 movimentos reais.
--
-- A chave é uma impressão digital:
--   • quando o banco dá um identificador único da transação (o `transactionId`
--     do Sicoob), a digital é ele — idempotência perfeita;
--   • quando não dá (CSV, OFX), é o hash do conteúdo + a ORDEM de ocorrência
--     dentro do grupo idêntico. Isso mantém duas transações realmente iguais
--     no mesmo dia como linhas distintas, e ainda assim faz a reimportação do
--     mesmo período cair nas mesmas digitais.

ALTER TABLE bank_statements
  ADD COLUMN IF NOT EXISTS fingerprint text;

COMMENT ON COLUMN bank_statements.fingerprint IS
  'Identidade da linha do extrato: transactionId do banco quando existe, senão hash(conteudo)+ordem de ocorrencia. Chave da importacao idempotente.';

-- ─── Limpeza das duplicatas que já existem ───────────────────────────────────
-- Mantém UMA linha por grupo idêntico, preferindo a que já foi conciliada (e,
-- entre iguais, a mais antiga). Nenhum vínculo de conciliação é perdido.
DO $$
DECLARE
  v_removidas integer;
BEGIN
  WITH ranqueadas AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY bank_account_id, date, amount, description, type
             ORDER BY (reconciled_entry_id IS NOT NULL) DESC, imported_at ASC, id ASC
           ) AS posicao
      FROM bank_statements
  ),
  sobra AS (SELECT id FROM ranqueadas WHERE posicao > 1)
  -- Só remove quem NÃO tem vínculo; vínculo nunca é descartado em silêncio.
  DELETE FROM bank_statements b
   USING sobra s
   WHERE b.id = s.id
     AND b.reconciled_entry_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM bank_statement_entry_links l WHERE l.statement_id = b.id);
  GET DIAGNOSTICS v_removidas = ROW_COUNT;
  RAISE NOTICE 'linhas duplicadas removidas: %', v_removidas;
END $$;

-- ─── Digital das linhas que sobraram ─────────────────────────────────────────
-- Linhas antigas não têm transactionId guardado (nunca foi capturado), então a
-- digital delas é a do conteúdo + ordem.
UPDATE bank_statements b
   SET fingerprint = z.digital
  FROM (
    SELECT id,
           md5(bank_account_id::text || '|' || date::text || '|' || amount::text
               || '|' || coalesce(description,'') || '|' || type)
           || ':' || row_number() OVER (
                PARTITION BY bank_account_id, date, amount, description, type
                ORDER BY imported_at ASC, id ASC
              )::text AS digital
      FROM bank_statements
     WHERE fingerprint IS NULL
  ) z
 WHERE b.id = z.id AND b.fingerprint IS NULL;

-- ─── A chave ─────────────────────────────────────────────────────────────────
-- Indice NAO parcial de proposito: ON CONFLICT so consegue inferir o indice
-- quando ele nao tem predicado. Linha com fingerprint nulo nao colide com
-- nada (NULLs sao distintos no Postgres), entao nao perde nada em seguranca.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statements_fingerprint
  ON bank_statements (bank_account_id, fingerprint);

-- Busca da tela: "o que já foi importado para esta conta neste período".
CREATE INDEX IF NOT EXISTS idx_bank_statements_conta_data
  ON bank_statements (bank_account_id, date);
