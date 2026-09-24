'use server'

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRATO DO CLIENTE — treinamento financeiro Animais, 18/09/2026
//
// Ana Lucia: "o ideal seria eu ter um relatório para só filtrar uma data,
//             colocar um cliente, entregar para o meu cliente, enviar um PDF".
// Bruna:     "tanto o que ele pagou quanto o que ele tem a pagar (...) consigo
//             puxar os dois relatórios juntos?" + "quero saber, na hora, se foi
//             uma pessoa do caixa que deu baixa".
//
// Um relatório só resolve os três pedidos. "Cliente" = TUTOR ou CLÍNICA
// PARCEIRA / PROTETOR — a Animais é laboratório de referência e fatura para os
// dois. O pagador em `financial_entries` é sempre `tutor_id`; o vínculo com a
// parceira vem por `consultation_id -> consultations.partner_clinic_id`.
//
// Toda consulta é filtrada por `clinic_id`. Colunas sempre explícitas.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveSettledBy,
  settledByLabel,
  summarizeStatement,
  NO_COMPANY_LABEL,
  type ClientKind,
  type StatementRow,
  type StatementClientOption,
  type ClientStatementResult,
} from '@/lib/reports/client-statement-logic'

async function getCtx(): Promise<{ error: string } | { clinic_id: string; role: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' }
  return { clinic_id: profile.clinic_id as string, role: profile.role as string }
}

/** Colunas lidas do título. Lista explícita — `SELECT *` é proibido aqui. */
const STATEMENT_COLUMNS =
  'id, description, document_number, due_date, payment_date, amount, discount, ' +
  'status, payment_method, type, company_id, settlement_bank_id, patient_id, ' +
  'consultation_id, tutor_id, is_intercompany, is_clinic_discount, ' +
  'cashier_entry_id, settled_by, settled_at'

const UUID_NONE = '00000000-0000-0000-0000-000000000000'

interface RawEntry {
  id: string; description: string; document_number: string | null
  due_date: string | null; payment_date: string | null
  amount: number; discount: number | null; status: string
  payment_method: string | null; type: string
  company_id: string | null; settlement_bank_id: string | null
  patient_id: string | null; consultation_id: string | null; tutor_id: string | null
  is_intercompany: boolean | null; is_clinic_discount: boolean | null
  cashier_entry_id: string | null; settled_by: string | null; settled_at: string | null
}

// ─── Seletor de cliente ───────────────────────────────────────────────────────

/**
 * Clientes com movimento financeiro no período — alimenta o seletor da tela.
 * Devolve tutores e clínicas parceiras/protetores na mesma lista.
 */
export async function listStatementClients(params: {
  from: string
  to:   string
}): Promise<StatementClientOption[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  const admin = createAdminClient()

  const { data: entries, error } = await admin
    .from('financial_entries')
    .select('tutor_id, consultation_id')
    .eq('clinic_id', ctx.clinic_id)
    .eq('type', 'receivable')
    .in('status', ['paid', 'pending'])
    .or(
      `and(payment_date.gte.${params.from},payment_date.lte.${params.to}),` +
      `and(due_date.gte.${params.from},due_date.lte.${params.to})`,
    )
  if (error) return { error: 'Erro ao listar clientes: ' + error.message }

  const rows = (entries ?? []) as Array<{ tutor_id: string | null; consultation_id: string | null }>
  const tutorIds   = [...new Set(rows.map(r => r.tutor_id).filter(Boolean))] as string[]
  const consultIds = [...new Set(rows.map(r => r.consultation_id).filter(Boolean))] as string[]

  const out: StatementClientOption[] = []

  if (tutorIds.length) {
    const { data: tutors } = await admin
      .from('tutors')
      .select('id, name, cpf')
      .eq('clinic_id', ctx.clinic_id)
      .in('id', tutorIds)
    for (const t of (tutors ?? []) as Array<{ id: string; name: string; cpf: string | null }>) {
      out.push({ kind: 'tutor', id: t.id, name: t.name, document: t.cpf })
    }
  }

  if (consultIds.length) {
    const { data: consults } = await admin
      .from('consultations')
      .select('partner_clinic_id')
      .eq('clinic_id', ctx.clinic_id)
      .in('id', consultIds)
      .not('partner_clinic_id', 'is', null)
    const partnerIds = [...new Set(
      ((consults ?? []) as Array<{ partner_clinic_id: string | null }>).map(c => c.partner_clinic_id),
    )].filter(Boolean) as string[]

    if (partnerIds.length) {
      const { data: partners } = await admin
        .from('partner_clinics')
        .select('id, name, cnpj')
        .eq('clinic_id', ctx.clinic_id)
        .in('id', partnerIds)
      for (const p of (partners ?? []) as Array<{ id: string; name: string; cnpj: string | null }>) {
        out.push({ kind: 'partner', id: p.id, name: p.name, document: p.cnpj })
      }
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

// ─── Quem deu baixa num título específico ─────────────────────────────────────

/**
 * Bruna: "eu quero saber, NA HORA, se foi uma pessoa do caixa que deu baixa."
 * Usado pelo modal do título no Financeiro — a resposta sem sair da tela.
 * Devolve `null` quando o título não está baixado.
 */
export async function getEntrySettler(
  entryId: string,
): Promise<{ label: string; source: string; at: string | null } | null | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  const admin = createAdminClient()

  const { data: e } = await admin
    .from('financial_entries')
    .select('id, status, settled_by, settled_at, cashier_entry_id')
    .eq('clinic_id', ctx.clinic_id)
    .eq('id', entryId)
    .single()
  const entry = e as { status: string; settled_by: string | null; settled_at: string | null; cashier_entry_id: string | null } | null
  if (!entry || entry.status !== 'paid') return null

  let recordedBy: string | null = null
  let recordedAt: string | null = null
  let openedBy:   string | null = null

  if (entry.cashier_entry_id) {
    const { data: cc } = await admin
      .from('central_cashier')
      .select('recorded_by, created_at, session_id')
      .eq('clinic_id', ctx.clinic_id)
      .eq('id', entry.cashier_entry_id)
      .single()
    const c = cc as { recorded_by: string | null; created_at: string | null; session_id: string | null } | null
    recordedBy = c?.recorded_by ?? null
    recordedAt = c?.created_at ?? null
    if (c?.session_id) {
      const { data: ss } = await admin
        .from('cashier_sessions')
        .select('opened_by')
        .eq('clinic_id', ctx.clinic_id)
        .eq('id', c.session_id)
        .single()
      openedBy = (ss as { opened_by: string | null } | null)?.opened_by ?? null
    }
  }

  const ids = [entry.settled_by, recordedBy, openedBy].filter(Boolean) as string[]
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('clinic_id', ctx.clinic_id)
      .in('id', ids)
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string }>) names[p.id] = p.full_name
  }

  const r = resolveSettledBy({
    settled_by:          entry.settled_by,
    settled_at:          entry.settled_at,
    cashier_recorded_by: recordedBy,
    cashier_recorded_at: recordedAt,
    session_opened_by:   openedBy,
    names,
  })
  return { label: settledByLabel(r), source: r.source, at: r.at }
}

// ─── O extrato ────────────────────────────────────────────────────────────────

/**
 * Pago × em aberto do cliente no período, com o operador que deu baixa em cada
 * recebimento e a quebra por empresa faturante (multi-CNPJ).
 */
export async function getClientStatement(params: {
  from:        string
  to:          string
  client_kind: ClientKind
  client_id:   string
  company_id?: string | null
}): Promise<ClientStatementResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error }
  if (!params.client_id) return { error: 'Selecione um cliente.' }
  const admin = createAdminClient()
  const asOf = new Date().toISOString().slice(0, 10)

  // ── 1. Identidade do cliente (e, para parceira, as consultas que são dela) ──
  let client: ClientStatementResult['client']
  let consultationIds: string[] = []

  if (params.client_kind === 'tutor') {
    const { data: t } = await admin
      .from('tutors')
      .select('id, name, cpf, phone, email')
      .eq('clinic_id', ctx.clinic_id)
      .eq('id', params.client_id)
      .single()
    if (!t) return { error: 'Tutor não encontrado nesta clínica.' }
    const tt = t as { id: string; name: string; cpf: string | null; phone: string | null; email: string | null }
    client = { kind: 'tutor', id: tt.id, name: tt.name, document: tt.cpf, phone: tt.phone, email: tt.email }
  } else {
    const { data: p } = await admin
      .from('partner_clinics')
      .select('id, name, cnpj, phone, email')
      .eq('clinic_id', ctx.clinic_id)
      .eq('id', params.client_id)
      .single()
    if (!p) return { error: 'Clínica parceira não encontrada nesta clínica.' }
    const pp = p as { id: string; name: string; cnpj: string | null; phone: string | null; email: string | null }
    client = { kind: 'partner', id: pp.id, name: pp.name, document: pp.cnpj, phone: pp.phone, email: pp.email }

    const { data: cons } = await admin
      .from('consultations')
      .select('id')
      .eq('clinic_id', ctx.clinic_id)
      .eq('partner_clinic_id', params.client_id)
    consultationIds = ((cons ?? []) as Array<{ id: string }>).map(c => c.id)
    // Sem consultas da parceira o filtro `in` ficaria vazio e devolveria tudo.
    if (!consultationIds.length) consultationIds = [UUID_NONE]
  }

  // ── 2. Títulos do cliente ───────────────────────────────────────────────────
  // Duas consultas em vez de uma com OR: pago filtra por `payment_date`, em
  // aberto por `due_date` — mesma convenção do getFinancialReport, para o
  // extrato não divergir do relatório financeiro geral da mesma clínica.
  const base = () => {
    let q = admin
      .from('financial_entries')
      .select(STATEMENT_COLUMNS)
      .eq('clinic_id', ctx.clinic_id)
      .eq('type', 'receivable')
      .eq('is_clinic_discount', false)   // ajuste contábil de convênio não é dívida do cliente
    q = params.client_kind === 'tutor'
      ? q.eq('tutor_id', params.client_id)
      : q.in('consultation_id', consultationIds)
    if (params.company_id) q = q.eq('company_id', params.company_id)
    return q
  }

  const [paidRes, pendingRes] = await Promise.all([
    base().eq('status', 'paid').gte('payment_date', params.from).lte('payment_date', params.to),
    base().eq('status', 'pending').gte('due_date', params.from).lte('due_date', params.to),
  ])
  if (paidRes.error)    return { error: 'Erro ao ler recebimentos: ' + paidRes.error.message }
  if (pendingRes.error) return { error: 'Erro ao ler títulos em aberto: ' + pendingRes.error.message }

  const raw = [
    ...((paidRes.data ?? []) as unknown as RawEntry[]),
    ...((pendingRes.data ?? []) as unknown as RawEntry[]),
  ]

  // ── 3. Trilha do operador que deu baixa ─────────────────────────────────────
  const cashierIds = [...new Set(raw.map(r => r.cashier_entry_id).filter(Boolean))] as string[]
  const cashierById = new Map<string, { recorded_by: string | null; created_at: string | null; session_id: string | null }>()
  if (cashierIds.length) {
    const { data: cc } = await admin
      .from('central_cashier')
      .select('id, recorded_by, created_at, session_id')
      .eq('clinic_id', ctx.clinic_id)
      .in('id', cashierIds)
    for (const c of (cc ?? []) as Array<{ id: string; recorded_by: string | null; created_at: string | null; session_id: string | null }>) {
      cashierById.set(c.id, { recorded_by: c.recorded_by, created_at: c.created_at, session_id: c.session_id })
    }
  }

  const sessionIds = [...new Set([...cashierById.values()].map(c => c.session_id).filter(Boolean))] as string[]
  const sessionOpenedBy = new Map<string, string | null>()
  if (sessionIds.length) {
    const { data: ss } = await admin
      .from('cashier_sessions')
      .select('id, opened_by')
      .eq('clinic_id', ctx.clinic_id)
      .in('id', sessionIds)
    for (const s of (ss ?? []) as Array<{ id: string; opened_by: string | null }>) {
      sessionOpenedBy.set(s.id, s.opened_by)
    }
  }

  const profileIds = [...new Set([
    ...raw.map(r => r.settled_by),
    ...[...cashierById.values()].map(c => c.recorded_by),
    ...[...sessionOpenedBy.values()],
  ].filter(Boolean))] as string[]
  const names: Record<string, string> = {}
  if (profileIds.length) {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('clinic_id', ctx.clinic_id)
      .in('id', profileIds)
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string }>) names[p.id] = p.full_name
  }

  // ── 4. Empresas faturantes (multi-CNPJ) ─────────────────────────────────────
  const { data: comps } = await admin
    .from('companies')
    .select('id, name, cnpj')
    .eq('clinic_id', ctx.clinic_id)
    .eq('is_active', true)
  const companies = (comps ?? []) as Array<{ id: string; name: string; cnpj: string | null }>
  const compName = new Map(companies.map(c => [c.id, c.name]))

  // Fallback de atribuição: título sem `company_id` mas com conta de liquidação
  // herda a empresa da conta — é como o DRE por CNPJ já atribui. Sem isso o
  // mesmo valor apareceria "sem empresa" aqui e com empresa lá.
  const bankIds = [...new Set(
    raw.filter(r => !r.company_id && r.settlement_bank_id).map(r => r.settlement_bank_id),
  )] as string[]
  const bankCompany = new Map<string, string | null>()
  if (bankIds.length) {
    const { data: banks } = await admin
      .from('bank_accounts')
      .select('id, company_id')
      .eq('clinic_id', ctx.clinic_id)
      .in('id', bankIds)
    for (const b of (banks ?? []) as Array<{ id: string; company_id: string | null }>) {
      bankCompany.set(b.id, b.company_id)
    }
  }

  // ── 5. Pets (o cliente reconhece o atendimento pelo nome do pet) ────────────
  const patientIds = [...new Set(raw.map(r => r.patient_id).filter(Boolean))] as string[]
  const petName = new Map<string, string>()
  if (patientIds.length) {
    const { data: pets } = await admin
      .from('patients')
      .select('id, name')
      .eq('clinic_id', ctx.clinic_id)
      .in('id', patientIds)
    for (const p of (pets ?? []) as Array<{ id: string; name: string }>) petName.set(p.id, p.name)
  }

  // ── 6. Monta as linhas ──────────────────────────────────────────────────────
  const rows: StatementRow[] = raw.map(r => {
    const cc = r.cashier_entry_id ? cashierById.get(r.cashier_entry_id) : undefined
    const settled = resolveSettledBy({
      settled_by:          r.settled_by,
      settled_at:          r.settled_at,
      cashier_recorded_by: cc?.recorded_by ?? null,
      cashier_recorded_at: cc?.created_at ?? null,
      session_opened_by:   cc?.session_id ? (sessionOpenedBy.get(cc.session_id) ?? null) : null,
      names,
    })
    const companyId = r.company_id
      ?? (r.settlement_bank_id ? (bankCompany.get(r.settlement_bank_id) ?? null) : null)
    return {
      id:              r.id,
      description:     r.description,
      document_number: r.document_number,
      due_date:        r.due_date,
      payment_date:    r.payment_date,
      amount:          Number(r.amount ?? 0),
      discount:        Number(r.discount ?? 0),
      status:          r.status === 'paid' ? 'paid' : 'pending',
      payment_method:  r.payment_method,
      type:            r.type,
      company_id:      companyId,
      company_name:    companyId ? (compName.get(companyId) ?? NO_COMPANY_LABEL) : null,
      patient_name:    r.patient_id ? (petName.get(r.patient_id) ?? null) : null,
      is_intercompany: r.is_intercompany,
      settled,
    }
  })

  const summary = summarizeStatement(rows, asOf)

  // ── 7. Identidade da clínica para o cabeçalho do PDF ────────────────────────
  const { data: cl } = await admin
    .from('clinics')
    .select('name, cnpj, phone, address, city, state, logo_url')
    .eq('id', ctx.clinic_id)
    .single()
  const c = (cl ?? {}) as Record<string, string | null>

  return {
    client,
    clinic: {
      name:     c.name ?? 'Clínica',
      cnpj:     c.cnpj ?? null,
      phone:    c.phone ?? null,
      address:  c.address ?? null,
      city:     c.city ?? null,
      state:    c.state ?? null,
      logo_url: c.logo_url ?? null,
    },
    filters:   { from: params.from, to: params.to, company_id: params.company_id ?? null, as_of: asOf },
    companies: companies.map(x => ({ id: x.id, name: x.name, cnpj: x.cnpj })),
    summary,
    has_unknown_settler: summary.paid.some(r => r.settled.source === 'unknown'),
  }
}
