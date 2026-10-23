-- 0516 — Separa o que se VENDE do que se USA.
--
-- Hoje toda a lista de estoque aparece nas telas de venda. Insumo cirúrgico,
-- material de uso e consumo e produto de limpeza entram no mesmo seletor em
-- que a recepção escolhe o que cobrar do tutor — e o que não devia ser
-- vendido fica a um clique de ser vendido.
--
-- O padrão é `true` de propósito. Marcar tudo como não-vendável e esperar que
-- alguém revise item a item faria o PDV amanhecer vazio; é mais seguro manter
-- o comportamento atual e deixar a clínica DESMARCAR o que é insumo.
--
-- A exceção são as categorias que já se sabe serem de consumo interno:
-- `clinic_product` (uso e consumo da clínica) e `grooming_supply` (insumo de
-- banho e tosa). Essas nascem desmarcadas porque nunca foram para vender.
--
-- Serviços não entram nessa conta: `is_service` já os separa, e serviço é
-- justamente o que se cobra.

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN NOT NULL DEFAULT true;

UPDATE stock_items
   SET is_sellable = false
 WHERE category IN ('clinic_product', 'grooming_supply')
   AND is_service IS NOT TRUE;

-- As telas de venda filtram por isto; sem índice, a lista do PDV faz varredura.
CREATE INDEX IF NOT EXISTS idx_stock_items_vendaveis
  ON stock_items (clinic_id, name)
  WHERE is_sellable = true AND archived_at IS NULL;

COMMENT ON COLUMN stock_items.is_sellable IS
  'Aparece nas telas de venda (PDV, Caixa, Faturamento). Falso = insumo ou uso e consumo.';
