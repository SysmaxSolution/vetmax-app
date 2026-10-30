-- 0530 — CFOP na entrada de mercadoria e venda para entrega futura.
--
-- Hoje o CFOP é texto morto: vem do XML, é gravado e ninguém olha. Três
-- pedidos da Clínica Animais (30/10/2026) dependem de dar sentido a ele:
--
--  1. A nota chega com o CFOP de SAÍDA do fornecedor (5102) e a entrada tem
--     que ser lançada com o de ENTRADA (1102). Hoje a conversão é mental.
--  2. Alguns CFOPs não podem gerar contas a pagar (bonificação, por exemplo).
--     O checkbox existia na tela, mas era volátil: a compra ficava "recebida"
--     sem registro de que o financeiro foi dispensado de propósito.
--  3. Entrega futura: o fornecedor fatura primeiro (5922/6922, só dinheiro) e
--     entrega aos poucos (5116/5117/6116/6117, só mercadoria). São duas notas
--     que precisam ficar ligadas, e a segunda abate o que falta da primeira.
--
-- Aditiva e idempotente. Nada é preenchido retroativamente: as compras antigas
-- continuam com natureza nula e comportamento igual ao de antes.

BEGIN;

-- ── Nota ────────────────────────────────────────────────────────────────────
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cfop_natureza TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS lanca_financeiro BOOLEAN;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS movimenta_estoque BOOLEAN;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS nota_origem_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS nfe_key_referenciada TEXT;

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS chk_purchase_cfop_natureza;
ALTER TABLE purchase_orders ADD CONSTRAINT chk_purchase_cfop_natureza
  CHECK (cfop_natureza IS NULL OR cfop_natureza IN (
    'compra', 'bonificacao', 'entrega_futura_faturamento',
    'entrega_futura_remessa', 'devolucao', 'remessa_temporaria', 'outra'));

COMMENT ON COLUMN purchase_orders.cfop_natureza IS
  'O que esta nota faz ao ser lançada, deduzido do CFOP (ver src/lib/fiscal/cfop.ts). NULL = compras anteriores à 0530.';
COMMENT ON COLUMN purchase_orders.lanca_financeiro IS
  'Decisão registrada: esta entrada gera contas a pagar? NULL = não decidido (compras antigas).';
COMMENT ON COLUMN purchase_orders.movimenta_estoque IS
  'Decisão registrada: esta entrada credita saldo? Falso no simples faturamento de entrega futura.';
COMMENT ON COLUMN purchase_orders.nota_origem_id IS
  'Nota de faturamento que esta remessa está abatendo (entrega futura).';
COMMENT ON COLUMN purchase_orders.nfe_key_referenciada IS
  'Chave da NF-e referenciada no XML (tag NFref) — é por ela que a remessa acha o faturamento.';

CREATE INDEX IF NOT EXISTS idx_purchase_orders_nota_origem
  ON purchase_orders (nota_origem_id) WHERE nota_origem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_nfe_ref
  ON purchase_orders (clinic_id, nfe_key_referenciada) WHERE nfe_key_referenciada IS NOT NULL;

-- ── Item ────────────────────────────────────────────────────────────────────
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS cfop_entrada TEXT;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS item_origem_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS quantidade_pendente NUMERIC(12,3);

COMMENT ON COLUMN purchase_order_items.cfop_entrada IS
  'CFOP com que este item entra aqui (5102 → 1102). O campo cfop guarda o que veio na nota do fornecedor.';
COMMENT ON COLUMN purchase_order_items.item_origem_id IS
  'Item da nota de faturamento que esta linha de remessa está abatendo.';
COMMENT ON COLUMN purchase_order_items.quantidade_pendente IS
  'Só na nota de faturamento de entrega futura: quanto ainda falta o fornecedor entregar desta linha.';

CREATE INDEX IF NOT EXISTS idx_purchase_items_origem
  ON purchase_order_items (item_origem_id) WHERE item_origem_id IS NOT NULL;

COMMIT;
