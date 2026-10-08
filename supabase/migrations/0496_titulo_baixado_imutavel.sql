-- 0496 — Título baixado é imutável no BANCO, não só na aplicação.
--
-- O defeito: `updateEntry` não tinha filtro de status nenhum —
--   .update(updates).eq('id', id).eq('clinic_id', clinicId)
-- e alterava valor, vencimento, descrição e tutor de um título JÁ BAIXADO,
-- sem rastro. Isso muda a data de realização de uma transação que já
-- aconteceu e desalinha a conciliação bancária daquele dia.
--
-- Travar só na Server Action não basta: medido neste banco,
--   has_table_privilege('authenticated','financial_entries','UPDATE') = true
-- com policy de UPDATE permissiva. Um usuário logado faz PATCH direto no
-- PostgREST com a chave anônima e contorna a aplicação inteira.
--
-- O prontuário clínico já tinha imutabilidade no banco (0411/0412). O
-- financeiro havia ficado de fora.
--
-- O que CONTINUA permitido:
--   • o ESTORNO (paid -> pending), que é o caminho legítimo para alterar;
--   • mexer em campos que não são do fato financeiro (notas, categoria,
--     centro de custo, vínculos de conciliação).
-- O que passa a ser recusado: mexer em valor, datas, forma de pagamento,
-- dono ou descrição de título que está baixado.

CREATE OR REPLACE FUNCTION fe_bloqueia_edicao_de_baixado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Só olha quem JÁ ESTAVA baixado.
  IF OLD.status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  -- Estorno: caminho legítimo. A trilha é gravada em audit_logs pela action
  -- reverseFinancialEntry antes do UPDATE.
  IF NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  -- Campos que descrevem o FATO financeiro. Mexer neles num título baixado
  -- reescreve história.
  IF  NEW.amount         IS DISTINCT FROM OLD.amount
   OR NEW.discount       IS DISTINCT FROM OLD.discount
   OR NEW.interest       IS DISTINCT FROM OLD.interest
   OR NEW.due_date       IS DISTINCT FROM OLD.due_date
   OR NEW.issue_date     IS DISTINCT FROM OLD.issue_date
   OR NEW.payment_date   IS DISTINCT FROM OLD.payment_date
   OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
   OR NEW.type           IS DISTINCT FROM OLD.type
   OR NEW.description    IS DISTINCT FROM OLD.description
   OR NEW.tutor_id       IS DISTINCT FROM OLD.tutor_id
   OR NEW.supplier_id    IS DISTINCT FROM OLD.supplier_id
  THEN
    RAISE EXCEPTION 'Título baixado não pode ser alterado. Estorne primeiro (Opções → Estornar) — o estorno guarda o histórico e devolve o título para aberto.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fe_imutavel_quando_baixado ON financial_entries;
CREATE TRIGGER trg_fe_imutavel_quando_baixado
  BEFORE UPDATE ON financial_entries
  FOR EACH ROW EXECUTE FUNCTION fe_bloqueia_edicao_de_baixado();

-- `anon` é a chave PÚBLICA do navegador e não tem o que escrever aqui. A RLS
-- já o barra (sem clínica não casa policy), mas o privilégio concedido era
-- descuido — e privilégio concedido é superfície.
REVOKE INSERT, UPDATE, DELETE ON financial_entries FROM anon;

COMMENT ON FUNCTION fe_bloqueia_edicao_de_baixado() IS
  'Imutabilidade do titulo baixado. Permite o estorno (paid->pending) e campos nao-financeiros; recusa alterar valor, datas, forma de pagamento, dono ou descricao.';
