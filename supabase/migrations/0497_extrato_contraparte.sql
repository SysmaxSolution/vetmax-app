-- 0497 — Guarda a contraparte da transação (quem pagou / quem recebeu).
--
-- O Sicoob manda um campo que a gente descartava: `descInfComplementar`.
-- Medido na resposta real, vem preenchido em 53 de 54 transações:
--
--   Recebimento Pix|@ROBERTA DE SOUZA PORTERO|@***.430.331-*
--   Recebimento Pix|@MARIA TERESA COSTA FELICIANO AMORIM|@**
--   Pagamento Pix|@51.097.732 0001-82|@fabio
--   CR COMPRAS MAESTRO      -> EVOLUSERVICES _Deb._Maestro
--   CR COMPRAS MASTERCARD   -> SIPAG_Cred._Mastercard
--
-- Para Pix vem o NOME da contraparte e o documento mascarado. Para cartão vem
-- a adquirente e a bandeira. Só "TARIFA COBRANÇA" vem sem — é tarifa do
-- próprio banco, não tem contraparte.
--
-- Serve para duas coisas: mostrar na tela DE QUEM é cada linha (hoje o
-- operador só vê "PIX RECEBIDO - OUTRA IF", que não diz nada), e dar um
-- critério de busca muito mais forte que valor+data.
--
-- `contraparte` guarda o texto cru do banco; `contraparte_nome` o nome
-- extraído, quando dá para extrair. Guardar o cru é o que permite melhorar a
-- extração depois sem reimportar.

ALTER TABLE bank_statements
  ADD COLUMN IF NOT EXISTS contraparte      text,
  ADD COLUMN IF NOT EXISTS contraparte_nome text;

COMMENT ON COLUMN bank_statements.contraparte IS
  'descInfComplementar do Sicoob, cru. Pix: "Recebimento Pix|@NOME|@doc". Cartao: "ADQUIRENTE_Tipo_Bandeira".';
COMMENT ON COLUMN bank_statements.contraparte_nome IS
  'Nome da contraparte extraido de `contraparte`, quando identificavel. Usado na busca e na exibicao.';

-- Busca por nome na tela de conciliação. Índice de trigrama porque o operador
-- digita parte do nome, não o nome exato.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_bank_statements_contraparte_nome
  ON bank_statements USING gin (contraparte_nome gin_trgm_ops);
