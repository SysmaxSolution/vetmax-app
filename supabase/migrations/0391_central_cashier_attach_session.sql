-- 0391 — Auto-vínculo de session_id em central_cashier
--
-- Causa raiz do bug de fechamento (Almavet, 16/06/2026): lançamentos de venda
-- nasciam em central_cashier com session_id NULL. O fechamento filtra por
-- session_id e ignorava todas as vendas, calculando dinheiro esperado negativo
-- (ex.: 87 + 0 − 200 = −113, quando o correto era +87). O relatório, que filtra
-- por data, mostrava o valor certo — as duas telas divergiam.
--
-- Solução (raiz): trigger BEFORE INSERT que preenche session_id da sessão
-- ABERTA da clínica quando vier nulo. Vale para TODOS os módulos (vendas,
-- grooming, faturamento, manual...). Espelha o comportamento das saídas
-- (cashier_outflows), que já recebem session_id. Idempotente.

CREATE OR REPLACE FUNCTION fn_central_cashier_attach_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só age quando o chamador não informou a sessão. Respeita inserts
  -- que já trazem session_id (ex.: backfill, importações).
  IF NEW.session_id IS NULL THEN
    SELECT s.id
      INTO NEW.session_id
      FROM cashier_sessions s
     WHERE s.clinic_id = NEW.clinic_id
       AND s.status = 'open'
     LIMIT 1;  -- índice único parcial garante no máx. 1 sessão aberta/clínica
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_central_cashier_attach_session ON central_cashier;
CREATE TRIGGER trg_central_cashier_attach_session
  BEFORE INSERT ON central_cashier
  FOR EACH ROW
  EXECUTE FUNCTION fn_central_cashier_attach_session();
