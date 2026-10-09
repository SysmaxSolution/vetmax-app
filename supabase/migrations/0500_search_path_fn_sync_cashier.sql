-- 0500: devolve o `search_path` fixado em fn_sync_cashier_entry_to_financial.
--
-- Em 09/10/2026 apliquei a migration 0427 em produção para fechar a
-- duplicidade de título em pagamento de consulta. O arquivo 0427 é anterior ao
-- endurecimento de SECURITY DEFINER do projeto e NÃO traz a cláusula
-- `SET search_path`, então o CREATE OR REPLACE dele apagou o pin que produção
-- tinha: das 76 funções SECURITY DEFINER, esta ficou a única sem.
--
-- Isso importa porque SECURITY DEFINER executa com os privilégios do dono. Sem
-- `search_path` fixado, quem conseguir criar um objeto num schema que venha
-- antes na resolução de nomes consegue fazer a função chamar o código dele com
-- privilégio de dono. É o vetor clássico de escalonamento, e o motivo de as
-- outras 75 já estarem fixadas.
--
-- Esta migration vem DEPOIS da 0427 de propósito: num banco novo, a 0427 cria
-- a função sem pin e esta corrige em seguida. O corpo é o mesmo da 0427 (a
-- guarda de source_module='consultation' continua), copiado da definição viva
-- do banco de testes, que é a canônica.

CREATE OR REPLACE FUNCTION public.fn_sync_cashier_entry_to_financial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_effective_date DATE;
BEGIN
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;

  -- Pagamentos de consulta já têm baixa própria (billing.ts). Não espelhar aqui,
  -- senão o título fica duplicado no Financeiro.
  IF NEW.source_module = 'consultation' THEN RETURN NEW; END IF;

  v_effective_date := COALESCE(NEW.effective_date, NEW.created_at::DATE);

  IF NOT EXISTS (SELECT 1 FROM financial_entries WHERE cashier_entry_id = NEW.id) THEN
    INSERT INTO financial_entries (
      clinic_id, type, description, amount,
      due_date, payment_date, status, payment_method,
      source, cashier_entry_id, created_by,
      created_at, updated_at
    ) VALUES (
      NEW.clinic_id,
      'receivable',
      COALESCE(NULLIF(TRIM(NEW.reason), ''), 'Lançamento do Caixa — ' || COALESCE(NEW.source_module, 'manual')),
      NEW.amount,
      v_effective_date,
      CASE WHEN NEW.status = 'pending' THEN NULL ELSE v_effective_date END,
      CASE WHEN NEW.status = 'pending' THEN 'pending' ELSE 'paid' END,
      NEW.payment_method,
      'cashier',
      NEW.id,
      NEW.recorded_by,
      NEW.created_at,
      NEW.created_at
    );
  END IF;

  RETURN NEW;
END;
$function$
;
