# G-09 — Módulo Financeiro Core

**Status:** Em execução  
**Data:** 2026-05-13  
**Sprint:** VetMax Feature Sprint — ERP Track

---

## Objetivo

Construir o coração financeiro do SysVetMax: gestão de títulos a receber e a pagar com totalizadores, filtros, badges de status visuais e modal unificado de baixa.

---

## Schema — Tabelas

### `financial_entries` (0115)
Tabela central de títulos financeiros. Suporta receivable (CR) e payable (CP).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | |
| clinic_id | UUID FK clinics | Multi-tenancy obrigatório |
| type | TEXT CHECK | `receivable` ou `payable` |
| description | TEXT | Descrição do título |
| amount | NUMERIC(12,2) | Valor em R$ |
| due_date | DATE | Data de vencimento |
| payment_date | DATE NULL | Data de recebimento/pagamento |
| status | TEXT CHECK | `pending`, `paid`, `cancelled` |
| payment_method | TEXT NULL | Modalidade de recebimento |
| tutor_id | UUID FK tutors NULL | Vínculo com tutor (CR) |
| patient_id | UUID FK patients NULL | Vínculo com paciente |
| category | TEXT NULL | Categoria do plano de contas |
| notes | TEXT NULL | Observações |
| created_by | UUID FK auth.users | Usuário que lançou |
| created_at / updated_at | TIMESTAMPTZ | |

> **Nota de design:** `overdue` é computado dinamicamente no cliente — `status='pending' AND due_date < today`. Evita jobs de manutenção periódica.

### `payment_methods` (0116)
Modalidades de recebimento/pagamento por clínica.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | |
| clinic_id | UUID FK | |
| name | TEXT | Ex: "PIX", "Cartão de Crédito" |
| type | TEXT CHECK | cash, pix, credit_card, debit_card, boleto, transfer, check, other |
| is_active | BOOLEAN | |

> Pré-seed: 8 métodos padrão inseridos via trigger na criação da clínica (or direct in migration).

### `bank_accounts` (0117)
Contas bancárias por clínica — base para Extrato (G-11).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | UUID PK | |
| clinic_id | UUID FK | |
| name | TEXT | Apelido da conta |
| bank_name | TEXT NULL | Nome do banco |
| bank_code | TEXT NULL | Código ISPB/BCB |
| agency | TEXT NULL | Agência |
| account | TEXT NULL | Conta corrente |
| pix_key | TEXT NULL | Chave PIX |
| is_default | BOOLEAN | Conta padrão para lançamentos |
| balance | NUMERIC(12,2) DEFAULT 0 | Saldo inicial |

> Pré-seed: "Caixa Central" inserido como conta padrão na migration.

### RLS — `0118_financial_rls.sql`
Todas as tabelas financeiras protegidas por `clinic_id = auth.uid()→profile.clinic_id`. Operações de escrita restritas a `admin`.

---

## Server Actions — `src/lib/actions/financial.ts`

| Função | Descrição |
|---|---|
| `createEntry(data)` | Cria novo título (CR ou CP) |
| `listEntries(filters)` | Lista com filtros de tipo, status, datas, busca |
| `updateEntry(id, data)` | Atualiza campos do título |
| `deleteEntry(id)` | Exclusão lógica (status = cancelled) ou física |
| `baixarTitulo(id, data)` | Marca como pago: status='paid', payment_date, payment_method |
| `getFinancialSummary(type)` | Retorna totais: a_vencer, vencidos, pago_mes |

---

## UI — Estrutura de Componentes

```
src/app/dashboard/financial/page.tsx          ← Server component (auth + data fetch)
src/components/financial/
  FinancialWorkspace.tsx                       ← Client workspace (tabs, state, tabela)
  TituloModal.tsx                              ← Modal create/edit/baixar/delete
```

### Totalizadores por aba

**Contas a Receber:**
- 🟡 A Vencer (mês corrente): pending + due_date ≤ fim do mês
- 🔴 Vencidos: pending + due_date < hoje
- 🟢 Recebidos (mês): paid + payment_date ≥ início do mês

**Contas a Pagar:**
- 🟡 A Vencer (mês corrente)
- 🔴 Vencidos
- 🟢 Pagos (mês)

### Badges de status

| Condição | Badge | Cor |
|---|---|---|
| pending + due_date ≥ hoje | Pendente | amber |
| pending + due_date < hoje | Atrasado | red |
| paid | Pago/Recebido | emerald |
| cancelled | Cancelado | slate |

---

## Integração Visual

- `MODULE_THEME.financial`: `bg-teal-50 / bg-teal-100 / bg-teal-600`
- Sidebar: ícone `DollarSign`, roles `['admin']`, sem `moduleKey` (sempre visível)
- Cor escolhida: **Teal** — diferencia do verde do Caixa (green) e do verde do WhatsApp

---

## Arquivos Alterados

| Arquivo | Tipo |
|---|---|
| `supabase/migrations/0115-0118` | Create — schema financeiro |
| `src/lib/actions/financial.ts` | Create — server actions |
| `src/app/dashboard/financial/page.tsx` | Create — rota |
| `src/components/financial/FinancialWorkspace.tsx` | Create — UI principal |
| `src/components/financial/TituloModal.tsx` | Create — modal |
| `src/lib/module-theme.ts` | Edit — adiciona `financial` |
| `src/components/layout/DashboardHeader.tsx` | Edit — adiciona tab Financeiro |
