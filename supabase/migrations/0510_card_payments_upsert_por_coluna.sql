-- As parcelas do cartão não estavam sendo gravadas, e o motivo era sutil.
--
-- A 0508 criou o índice único sobre uma EXPRESSÃO:
--   (card_transaction_id, kind, number, coalesce(recipient_document, ''))
-- e o upsert do PostgREST declara COLUNAS:
--   onConflict: 'card_transaction_id,kind,number,recipient_document'
--
-- O Postgres não casa os dois: um índice sobre expressão não satisfaz um
-- ON CONFLICT por coluna. O banco responde 42P10 ("there is no unique or
-- exclusion constraint matching the ON CONFLICT specification") e NENHUMA
-- parcela entra. Medido em 22/10/2026 com o callback real da maquininha:
-- a transação gravou (APPROVED, NSU 999220007) e `card_transaction_payments`
-- ficou vazia, mesmo com `payments[]` no payload.
--
-- A rota devolvia o aviso em vez de engolir — mas aviso que ninguém lê não
-- conserta dado. A correção é fazer a coluna ser o que o índice indexa:
-- `recipient_document` passa a ser NOT NULL com default '', e o índice volta a
-- ser de colunas simples. Quem não tem beneficiário (a parcela do próprio
-- estabelecimento) guarda string vazia, não NULL.

ALTER TABLE card_transaction_payments
  ALTER COLUMN recipient_document SET DEFAULT '';

UPDATE card_transaction_payments
   SET recipient_document = ''
 WHERE recipient_document IS NULL;

ALTER TABLE card_transaction_payments
  ALTER COLUMN recipient_document SET NOT NULL;

-- O índice de expressão sai: manter os dois seria indexar a mesma coisa duas
-- vezes e deixar a armadilha de pé para a próxima pessoa.
DROP INDEX IF EXISTS uq_card_transaction_payments;

CREATE UNIQUE INDEX IF NOT EXISTS uq_card_transaction_payments
  ON card_transaction_payments (card_transaction_id, kind, number, recipient_document);
