-- 0512 — Os boletos do DDA guardados ganham dono.
--
-- `dda_boletos.bank_account_id` existe desde a 0504, mas a varredura rodava
-- sempre na conta padrão e a LEITURA do período nunca filtrava por conta. Com
-- uma conta só isso não aparecia; com três CNPJs no mesmo Sicoob, trocar de
-- conta no PAGFOR continuava trazendo exatamente os mesmos boletos — medido em
-- produção em 23/10, com 14 linhas órfãs (`bank_account_id` nulo).
--
-- As linhas órfãs vão para a conta Sicoob padrão da clínica porque foi
-- literalmente de lá que vieram: até agora `loadPagamentosRuntime` escolhia
-- `bank_code='756' ORDER BY is_default DESC` quando ninguém informava conta.
-- Atribuir é reconstituir o fato, não chutar.
--
-- Sem isto, passar a filtrar por conta esconderia das três contas todo o
-- trabalho já feito (o que foi lançado e o que foi ignorado).

UPDATE dda_boletos d
   SET bank_account_id = (
     SELECT b.id FROM bank_accounts b
      WHERE b.clinic_id = d.clinic_id
        AND regexp_replace(COALESCE(b.bank_code, ''), '\D', '', 'g') = '756'
      ORDER BY b.is_default DESC, b.created_at
      LIMIT 1
   )
 WHERE d.bank_account_id IS NULL
   AND EXISTS (
     SELECT 1 FROM bank_accounts b
      WHERE b.clinic_id = d.clinic_id
        AND regexp_replace(COALESCE(b.bank_code, ''), '\D', '', 'g') = '756'
   );

-- A leitura do período passa a filtrar por conta; este índice é o que ela usa.
CREATE INDEX IF NOT EXISTS idx_dda_boletos_conta_periodo
  ON dda_boletos (clinic_id, bank_account_id, due_date);
