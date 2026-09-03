-- 0429: permite movimentação de cartão AVULSA (sem venda/split vinculado).
--
-- Na conciliação de cartões (1.1), o usuário pode INCLUIR títulos "não
-- encontrados" — movimentações que constam no extrato da adquirente mas não
-- estavam lançadas no sistema. Essas entram na movimentação de cartões sem estar
-- amarradas a uma invoice_payment_splits. Torna split_id opcional. Aditiva.

ALTER TABLE card_installments ALTER COLUMN split_id DROP NOT NULL;
