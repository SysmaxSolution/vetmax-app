# G-06 — Módulo Vendas / PDV
**Status:** Planejamento  
**Prioridade:** Epic (sprint dedicada, 2–3 sprints)  
**Dependências:** Nenhuma bloqueadora  
**Responsável:** Dev Principal + DBA

---

## Visão Geral

PDV (Ponto de Venda) integrado ao VetMax para registro de vendas avulsas, produtos e serviços sem vínculo obrigatório com consulta. Lançamento automático no Caixa. Multi-tenancy obrigatório (`clinic_id` em todas as tabelas).

---

## Escopo do MVP (Sprint 1)

| Funcionalidade | Prioridade |
|----------------|-----------|
| CRUD de produtos/serviços no catálogo | P0 |
| Tela de PDV (busca, carrinho, checkout) | P0 |
| Lançamento automático no Caixa | P0 |
| Recibo simples (modal + PDF) | P0 |
| Formas de pagamento: Dinheiro / Cartão / Pix | P0 |
| Desconto de estoque ao finalizar venda | P1 |
| Relatório de vendas diário | P1 |
| Venda vinculada a consulta/tutor | P2 |

---

## Arquitetura de Dados

### Tabelas Novas

```sql
-- Venda principal
CREATE TABLE IF NOT EXISTS sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID NOT NULL REFERENCES clinics(id),
  seller_id        UUID REFERENCES profiles(id),        -- quem realizou
  tutor_id         UUID REFERENCES tutors(id),          -- opcional
  consultation_id  UUID REFERENCES consultations(id),   -- opcional
  total_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('cash','card','pix','installment')),
  payment_status   TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('pending','paid','cancelled')),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at     TIMESTAMPTZ,
  cancelled_by     UUID REFERENCES profiles(id)
);

-- Itens da venda
CREATE TABLE IF NOT EXISTS sale_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  clinic_id   UUID NOT NULL REFERENCES clinics(id),
  product_id  UUID REFERENCES products(id),    -- NULL = item manual
  description TEXT NOT NULL,
  quantity    NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(10,2) NOT NULL,
  discount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  total       NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price - discount) STORED
);

-- Índices
CREATE INDEX ON sales(clinic_id, created_at DESC);
CREATE INDEX ON sales(clinic_id, tutor_id);
CREATE INDEX ON sale_items(sale_id);
CREATE INDEX ON sale_items(clinic_id, product_id);
```

### Tabelas Alteradas

```sql
-- Integração com caixa
ALTER TABLE cashier_sessions
  ADD COLUMN IF NOT EXISTS sales_total NUMERIC(10,2) DEFAULT 0;

-- Produto: adicionar campo de estoque se não existir
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_quantity NUMERIC(10,3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stock_alert_threshold NUMERIC(10,3) DEFAULT NULL;
```

### Trigger de Desconto de Estoque

```sql
CREATE OR REPLACE FUNCTION fn_decrement_stock_on_sale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE products
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE id = NEW.product_id
      AND stock_quantity IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sale_item_stock
  AFTER INSERT ON sale_items
  FOR EACH ROW EXECUTE FUNCTION fn_decrement_stock_on_sale();
```

### RLS

```sql
ALTER TABLE sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_clinic_isolation      ON sales      USING (clinic_id = auth.jwt() ->> 'clinic_id');
CREATE POLICY sale_items_clinic_isolation ON sale_items USING (clinic_id = auth.jwt() ->> 'clinic_id');
```

---

## Estrutura de Pastas

```
src/app/(dashboard)/sales/
  page.tsx                    ← PDV principal
  history/page.tsx            ← Histórico de vendas
  reports/page.tsx            ← Relatório diário

src/components/sales/
  SalesWorkspace.tsx          ← Container raiz do PDV
  ProductSearch.tsx           ← Busca de produto por nome/código
  SalesCart.tsx               ← Carrinho (lista de itens + totais)
  SalesCartItem.tsx           ← Linha do carrinho com qty/desconto
  CheckoutModal.tsx           ← Modal de pagamento + recibo
  ReceiptModal.tsx            ← Exibição/impressão do recibo
  SalesHistoryTable.tsx       ← Histórico paginado

src/lib/actions/
  sales.ts                    ← Server Actions (createSale, cancelSale, getSales)
```

---

## Fluxo PDV (UX)

```
Tela PDV
  ↓ digita nome do produto → autocomplete
  ↓ clica → produto entra no carrinho
  ↓ ajusta qty e desconto inline
  ↓ clica "Finalizar" → CheckoutModal
    - seleciona forma de pagamento
    - confirma valor / troco (cash)
    - clica "Confirmar"
    → createSale() → insere sales + sale_items
    → trigger decrementa estoque
    → lança no cashier_sessions (revenue)
    → exibe ReceiptModal
    → opção: imprimir / enviar WhatsApp ao tutor
```

---

## Server Actions (sales.ts)

```typescript
// Criar venda completa (sales + sale_items em transação via RPC)
export async function createSale(params: CreateSaleParams): Promise<{ id: string } | { error: string }>

// Cancelar venda (soft delete, não reverte estoque — criar ajuste manual)
export async function cancelSale(saleId: string, reason: string): Promise<{ success: boolean } | { error: string }>

// Buscar vendas do dia para o caixa
export async function getDailySales(date?: string): Promise<Sale[] | { error: string }>

// Relatório: total por forma de pagamento
export async function getSalesSummary(startDate: string, endDate: string): Promise<SalesSummary | { error: string }>
```

---

## Componentes — Especificação Técnica

### SalesWorkspace.tsx
- Estado local: `cart: CartItem[]`, `searchQuery`, `showCheckout`
- Busca produtos via `searchProducts(query)` — debounce 300ms
- Atalho teclado: `F2` = foca busca de produto
- Subtotal calculado em tempo real com `useMemo`

### CheckoutModal.tsx
- Seletor de forma de pagamento (Dinheiro / Cartão / Pix)
- Modo Dinheiro: campo "Valor recebido" → exibe troco calculado
- Botão "Confirmar" dispara `createSale()` em `useTransition`
- Em caso de erro: mensagem inline, não fecha o modal

### ReceiptModal.tsx
- Layout A5 para impressão via `window.print()`
- Exibe: clínica, data/hora, itens, subtotal, desconto, total, forma de pagamento, atendente
- Botão "Enviar WhatsApp" (se tutor selecionado): texto pré-formatado com total

---

## Integração com Caixa

Ao confirmar venda em `createSale()`:

```typescript
// Dentro da mesma transação RPC:
await admin.rpc('add_sale_to_cashier', {
  p_clinic_id:    clinicId,
  p_amount:       totalAmount,
  p_payment_method: paymentMethod,
  p_sale_id:      saleId,
})
```

A função RPC `add_sale_to_cashier` insere em `cashier_transactions` e atualiza `cashier_sessions.sales_total`.

---

## Navegação e Permissões

| Papel | Acesso |
|-------|--------|
| Admin | Total (vendas + histórico + relatório) |
| Recepcionista | PDV + histórico próprio |
| Auxiliar | PDV apenas |
| MV | Somente leitura |

Entrada no nav lateral sob "Caixa" ou como módulo separado "Vendas", configurável via `clinic_settings.modules_enabled`.

---

## Plano de Sprints

### Sprint G-06-A (banco + actions)
- [ ] Migrations: `sales`, `sale_items`, alterações em `products` e `cashier_sessions`
- [ ] RLS policies
- [ ] Trigger de estoque
- [ ] RPC `add_sale_to_cashier`
- [ ] Server Actions: `createSale`, `cancelSale`, `getDailySales`
- [ ] Testes unitários das actions (Jest)

### Sprint G-06-B (UI PDV)
- [ ] Rota `/dashboard/sales`
- [ ] `SalesWorkspace` + `ProductSearch` + `SalesCart`
- [ ] `CheckoutModal` com formas de pagamento
- [ ] `ReceiptModal` com impressão
- [ ] Integração com caixa (lançamento automático)
- [ ] Atalhos de teclado (F2, Enter para confirmar)

### Sprint G-06-C (relatórios + extras)
- [ ] Histórico de vendas paginado (`/dashboard/sales/history`)
- [ ] Relatório diário por forma de pagamento
- [ ] Venda vinculada a tutor/consulta
- [ ] Envio de recibo via WhatsApp (Evolution API)
- [ ] E2E Playwright: spec `sprint-master-g06-pdv.spec.ts`
- [ ] RBAC por módulo (via G-08)

---

## KPIs de Aceite

| Critério | Mínimo |
|----------|--------|
| Criar venda completa (3 itens) | < 2s |
| Autocomplete de produto | < 300ms |
| PDF do recibo gerado | < 1s |
| 0 divergências caixa vs vendas no dia | 100% |
| Cobertura E2E PDV | ≥ 80% dos fluxos críticos |

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Trigger de estoque reverter venda cancelada | Cancelamento é soft delete; ajuste de estoque é manual/separado |
| Divergência no caixa se RPC falhar | Usar transação DB — se falhar, nada é commitado |
| Permissão RLS bloquear a RPC | RPC executada com `SECURITY DEFINER` + verificação de `clinic_id` interna |
| Produtos sem `stock_quantity` (NULL) | Trigger verifica `IS NOT NULL` antes de decrementar |

---

*Gerado em: 2026-05-11 · VetMax Sprint Master G-06*
