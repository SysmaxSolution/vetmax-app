// Extrato do Cliente — lógica pura (sem Supabase, sem React).
//
// Atende dois pedidos do treinamento financeiro de 18/09/2026:
//   • Ana Lucia — "filtrar uma data, colocar um cliente, entregar para o meu
//     cliente, enviar um PDF para ele".
//   • Bruna (b)  — "tanto o que ele pagou quanto o que ele tem a pagar",
//     num relatório só.
//
// "Cliente" aqui tem duas naturezas, porque a Animais é laboratório de
// referência: o TUTOR (pessoa física) e a CLÍNICA PARCEIRA / PROTETOR
// (`partner_clinics`, ligada ao título por consultations.partner_clinic_id).
// Ver `resolveRejectionRecipients` em src/lib/exams/rejection-flow.ts, que já
// trata parceira e tutor como destinatários distintos do mesmo atendimento.
//
// Os dois lados do extrato são `type = 'receivable'`: o que o cliente já pagou
// (`status = 'paid'`) e o que ele ainda deve (`status = 'pending'`). Não é
// receivable × payable — "a pagar" é da boca do cliente, não da clínica.

import { netAmount, isIntercompany, type EntryLike } from '@/lib/finance/reconciliation'

// ─── Cliente ──────────────────────────────────────────────────────────────────

export type ClientKind = 'tutor' | 'partner'

export interface StatementClient {
  kind:     ClientKind
  id:       string
  name:     string
  document: string | null   // CPF do tutor · CNPJ da parceira
  phone:    string | null
  email:    string | null
}

// ─── Rastreabilidade da baixa (pedido da Bruna, item a) ──────────────────────

/**
 * De onde saiu o nome do operador que deu baixa. Exposto na UI de propósito:
 * "não registrado" é uma resposta honesta e diferente de "foi o fulano".
 */
export type SettledBySource =
  | 'direct'   // financial_entries.settled_by — gravado na própria baixa (0480+)
  | 'cashier'  // central_cashier.recorded_by via cashier_entry_id
  | 'session'  // cashier_sessions.opened_by da sessão do lançamento de caixa
  | 'unknown'  // baixa anterior a 0480 sem vínculo de caixa

export interface SettledByInput {
  settled_by:          string | null
  settled_at:          string | null
  cashier_recorded_by: string | null
  cashier_recorded_at: string | null
  session_opened_by:   string | null
  /** Mapa profiles.id -> full_name, resolvido em uma consulta só. */
  names:               Record<string, string>
}

export interface SettledByResult {
  operator_id:   string | null
  operator_name: string | null
  source:        SettledBySource
  at:            string | null
}

export const SETTLED_BY_UNKNOWN_LABEL = 'Não registrado'

/**
 * Resolve quem deu baixa, em ordem de confiança decrescente.
 *
 * Regra que NÃO aplicamos de propósito: cair em `created_by`. Esse campo é o
 * criador do título — apontá-lo como quem baixou seria inventar um culpado. Um
 * título sem ator conhecido volta como 'unknown', e a tela diz isso.
 */
export function resolveSettledBy(input: SettledByInput): SettledByResult {
  const nameOf = (id: string | null): string | null =>
    id ? (input.names[id] ?? null) : null

  if (input.settled_by) {
    return {
      operator_id:   input.settled_by,
      operator_name: nameOf(input.settled_by),
      source:        'direct',
      at:            input.settled_at ?? null,
    }
  }
  if (input.cashier_recorded_by) {
    return {
      operator_id:   input.cashier_recorded_by,
      operator_name: nameOf(input.cashier_recorded_by),
      source:        'cashier',
      at:            input.cashier_recorded_at ?? null,
    }
  }
  if (input.session_opened_by) {
    return {
      operator_id:   input.session_opened_by,
      operator_name: nameOf(input.session_opened_by),
      source:        'session',
      at:            input.cashier_recorded_at ?? null,
    }
  }
  return { operator_id: null, operator_name: null, source: 'unknown', at: null }
}

/** Rótulo curto para tela e PDF. */
export function settledByLabel(r: SettledByResult): string {
  if (!r.operator_id) return SETTLED_BY_UNKNOWN_LABEL
  const name = r.operator_name ?? 'Operador removido'
  return r.source === 'session' ? `${name} (operador da sessão)` : name
}

// ─── Linhas do extrato ────────────────────────────────────────────────────────

export type StatementStatus = 'paid' | 'pending'

export interface StatementRow extends EntryLike {
  id:              string
  description:     string
  document_number: string | null
  due_date:        string | null   // ISO yyyy-mm-dd
  payment_date:    string | null   // ISO yyyy-mm-dd
  amount:          number
  discount:        number | null
  status:          StatementStatus
  payment_method:  string | null
  company_id:      string | null
  company_name:    string | null
  patient_name:    string | null
  settled:         SettledByResult
}

/** Dias de atraso de um título em aberto na data de posição. Nunca negativo. */
export function daysOverdue(dueDate: string | null, asOf: string): number {
  if (!dueDate) return 0
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`)
  const ref = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(due) || !Number.isFinite(ref)) return 0
  const diff = Math.floor((ref - due) / 86_400_000)
  return diff > 0 ? diff : 0
}

export function isOverdue(row: StatementRow, asOf: string): boolean {
  return row.status === 'pending' && daysOverdue(row.due_date, asOf) > 0
}

// ─── Agregação ────────────────────────────────────────────────────────────────

export interface StatementTotals {
  paid_count:     number
  paid_total:     number
  pending_count:  number
  pending_total:  number
  overdue_count:  number
  overdue_total:  number
  /** Saldo devedor do cliente na data de posição — igual a pending_total. */
  balance:        number
}

export interface CompanyBreakdownRow {
  company_id:    string | null
  company_name:  string
  paid_total:    number
  pending_total: number
}

export interface StatementSummary {
  totals:     StatementTotals
  byCompany:  CompanyBreakdownRow[]
  paid:       StatementRow[]
  pending:    StatementRow[]
}

export const NO_COMPANY_LABEL = 'Sem empresa vinculada'

const round2 = (v: number): number => Math.round(v * 100) / 100

/**
 * Consolida as linhas em pago × a pagar, com quebra por empresa faturante
 * (a Animais opera 3 CNPJs — o cliente precisa ver de qual empresa é cada
 * valor, senão o extrato não fecha com a nota que ele recebeu).
 *
 * Movimento entre CNPJs (`is_intercompany`) fica de fora: não é dinheiro do
 * cliente, é transferência interna. Mesma regra do DRE consolidado.
 */
export function summarizeStatement(rows: StatementRow[], asOf: string): StatementSummary {
  const real = rows.filter(r => !isIntercompany(r))

  const paid    = real.filter(r => r.status === 'paid')
  const pending = real.filter(r => r.status === 'pending')
  const overdue = pending.filter(r => isOverdue(r, asOf))

  const sum = (list: StatementRow[]): number =>
    round2(list.reduce((acc, r) => acc + netAmount(r), 0))

  const paidTotal    = sum(paid)
  const pendingTotal = sum(pending)

  const byCompanyMap = new Map<string, CompanyBreakdownRow>()
  for (const r of real) {
    const key = r.company_id ?? '__none__'
    let bucket = byCompanyMap.get(key)
    if (!bucket) {
      bucket = {
        company_id:    r.company_id ?? null,
        company_name:  r.company_name ?? NO_COMPANY_LABEL,
        paid_total:    0,
        pending_total: 0,
      }
      byCompanyMap.set(key, bucket)
    }
    if (r.status === 'paid') bucket.paid_total    += netAmount(r)
    else                     bucket.pending_total += netAmount(r)
  }

  const byCompany = [...byCompanyMap.values()]
    .map(b => ({ ...b, paid_total: round2(b.paid_total), pending_total: round2(b.pending_total) }))
    .sort((a, b) => (b.paid_total + b.pending_total) - (a.paid_total + a.pending_total))

  return {
    totals: {
      paid_count:    paid.length,
      paid_total:    paidTotal,
      pending_count: pending.length,
      pending_total: pendingTotal,
      overdue_count: overdue.length,
      overdue_total: sum(overdue),
      balance:       pendingTotal,
    },
    byCompany,
    paid:    [...paid].sort(byDateAsc(r => r.payment_date ?? r.due_date)),
    pending: [...pending].sort(byDateAsc(r => r.due_date)),
  }
}

function byDateAsc(pick: (r: StatementRow) => string | null) {
  return (a: StatementRow, b: StatementRow): number => {
    const va = pick(a) ?? ''
    const vb = pick(b) ?? ''
    if (va === vb) return a.description.localeCompare(b.description, 'pt-BR')
    return va < vb ? -1 : 1
  }
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

export interface StatementFilters {
  from:        string          // ISO yyyy-mm-dd
  to:          string          // ISO yyyy-mm-dd
  company_id?: string | null   // null/undefined = todas as empresas
}

/**
 * Data que coloca o título dentro do período.
 *
 * Pago  → `payment_date` (quando o dinheiro entrou).
 * Aberto → `due_date`    (quando vence).
 *
 * É a mesma convenção do FinancialReport (`getFinancialReport`), para o extrato
 * do cliente não divergir do relatório financeiro geral da mesma clínica.
 */
export function periodDateOf(row: StatementRow): string | null {
  return row.status === 'paid' ? (row.payment_date ?? row.due_date) : row.due_date
}

export function matchesFilters(row: StatementRow, f: StatementFilters): boolean {
  if (f.company_id && row.company_id !== f.company_id) return false
  const d = periodDateOf(row)
  if (!d) return false
  const day = d.slice(0, 10)
  return day >= f.from.slice(0, 10) && day <= f.to.slice(0, 10)
}

export function applyFilters(rows: StatementRow[], f: StatementFilters): StatementRow[] {
  return rows.filter(r => matchesFilters(r, f))
}

// ─── Envelope de resposta ─────────────────────────────────────────────────────
// Declarados aqui (módulo puro) e não no arquivo 'use server': tipo exportado de
// dentro de um módulo de server action quebra as actions no Turbopack/Next 16.

export interface StatementClinic {
  name:         string
  cnpj:         string | null
  phone:        string | null
  address:      string | null
  city:         string | null
  state:        string | null
  logo_url:     string | null
}

export interface StatementCompanyOption {
  id:   string
  name: string
  cnpj: string | null
}

/** Uma opção da busca de cliente: tutor ou clínica parceira / protetor. */
export interface StatementClientOption {
  kind:     ClientKind
  id:       string
  name:     string
  document: string | null
}

export interface ClientStatementResult {
  client:     StatementClient
  clinic:     StatementClinic
  filters:    StatementFilters & { as_of: string }
  companies:  StatementCompanyOption[]
  summary:    StatementSummary
  /** TRUE quando ao menos um título pago do período não tem operador conhecido. */
  has_unknown_settler: boolean
}
