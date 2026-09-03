'use server'

// 1.1 · Conciliação de Cartões (GRUPO A). Cruza o EXTRATO DA ADQUIRENTE contra as
// parcelas de cartão do sistema (card_installments) por NSU + valor + data.
// Fontes: ARQUIVO (parser pluggável por formato) e, futuramente, API da adquirente.
// A parte de API/formatos específicos (Sipag EDI, FinPet) pluga sobre o mesmo
// motor de matching + baixa aqui.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { clinic_id: profile.clinic_id as string, user_id: user.id, role: profile.role as string }
}

// Linha normalizada do extrato da adquirente (saída de qualquer parser).
export interface StatementRow {
  nsu:                string | null
  authorization:      string | null
  brand:              string | null   // bandeira
  installment:        number | null   // parcela
  total_installments: number | null
  gross:              number | null   // valor bruto
  net:                number | null   // valor líquido
  fee:                number | null   // taxa (MDR) em R$
  sale_date:          string | null   // data da venda (YYYY-MM-DD)
  settlement_date:    string | null   // data de repasse/vencimento (YYYY-MM-DD)
  raw:                string          // linha original (rastreio)
}

export type MatchStatus = 'linked' | 'divergent' | 'not_found' | 'already'

export interface MatchedRow {
  statement:      StatementRow
  installment_id: string | null
  status:         MatchStatus
  diffs:          string[]          // campos divergentes (bruto/líquido/taxa/bandeira/parcela)
  system: null | {
    gross: number; net: number; fee: number
    nsu: string | null; brand: string | null
    installment_number: number; total_installments: number
    expected_settlement_date: string
    patient_name: string | null
  }
}

export interface CardMatchResult {
  rows: MatchedRow[]
  summary: { linked: number; divergent: number; not_found: number; already: number; total: number }
}

// ─── Parser de arquivo ────────────────────────────────────────────────────────
// Formato 'csv' (genérico): cabeçalho com colunas reconhecidas por alias PT/EN.
// Demais formatos (sipag_edi, finpet) são plugados aqui conforme o layout real.
const num = (v: string | undefined): number | null => {
  if (v == null) return null
  const s = String(v).trim().replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
const toDate = (v: string | undefined): string | null => {
  if (!v) return null
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);   if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);  if (m) return `20${m[3]}-${m[2]}-${m[1]}`
  return null
}

const CSV_ALIASES: Record<keyof StatementRow, string[]> = {
  nsu:                ['nsu', 'doc', 'documento', 'nsu/doc', 'cv', 'comprovante'],
  authorization:      ['autorizacao', 'autorização', 'auth', 'cod_autorizacao', 'lib'],
  brand:              ['bandeira', 'brand', 'produto'],
  installment:        ['parcela', 'installment', 'nº parcela', 'num_parcela'],
  total_installments: ['total_parcelas', 'qtd_parcelas', 'parcelas', 'total parcelas'],
  gross:              ['valor_bruto', 'bruto', 'valor bruto', 'valor_venda', 'valor', 'gross'],
  net:                ['valor_liquido', 'liquido', 'líquido', 'valor líquido', 'valor_repasse', 'net'],
  fee:                ['taxa', 'mdr', 'valor_taxa', 'desconto', 'comissao', 'comissão', 'fee'],
  sale_date:          ['data_venda', 'data venda', 'data', 'data_transacao', 'sale_date'],
  settlement_date:    ['data_repasse', 'data_pagamento', 'previsao', 'previsão', 'vencimento', 'data_credito', 'settlement'],
  raw:                [],
}

function parseCsv(text: string): StatementRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const header = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const idxOf = (aliases: string[]) => header.findIndex(h => aliases.includes(h))
  const col: Partial<Record<keyof StatementRow, number>> = {}
  ;(Object.keys(CSV_ALIASES) as (keyof StatementRow)[]).forEach(k => { if (k !== 'raw') col[k] = idxOf(CSV_ALIASES[k]) })

  return lines.slice(1).map(line => {
    const c = line.split(delim).map(v => v.trim().replace(/^"|"$/g, ''))
    const get = (k: keyof StatementRow) => (col[k] != null && col[k]! >= 0 ? c[col[k]!] : undefined)
    const inst = num(get('installment'))
    const tot  = num(get('total_installments'))
    return {
      nsu:                get('nsu')?.trim() || null,
      authorization:      get('authorization')?.trim() || null,
      brand:              get('brand')?.trim() || null,
      installment:        inst != null ? Math.round(inst) : null,
      total_installments: tot  != null ? Math.round(tot)  : null,
      gross:              num(get('gross')),
      net:                num(get('net')),
      fee:                num(get('fee')),
      sale_date:          toDate(get('sale_date')),
      settlement_date:    toDate(get('settlement_date')),
      raw:                line,
    } as StatementRow
  })
}

export async function parseCardStatement(text: string, format: 'csv' | 'sipag_edi' | 'finpet' = 'csv'): Promise<StatementRow[] | { error: string }> {
  try {
    if (format === 'csv') return parseCsv(text)
    // Sipag EDI (28 colunas) e FinPet: layout fixo específico — plugam aqui quando
    // houver um arquivo real de exemplo. Por ora, tenta CSV como fallback.
    return parseCsv(text)
  } catch (e) {
    return { error: `Falha ao ler o arquivo: ${(e as Error).message}` }
  }
}

// ─── Matching contra card_installments ────────────────────────────────────────
export async function matchCardStatement(rows: StatementRow[]): Promise<CardMatchResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()

  const { data: instsRaw } = await admin
    .from('card_installments')
    .select('id, card_nsu, card_brand, installment_number, total_installments, gross_amount, net_amount, fee_amount, expected_settlement_date, status, invoice_id')
    .eq('clinic_id', ctx.clinic_id)
    .neq('status', 'cancelled')
  const insts = (instsRaw ?? []) as any[]

  // nomes de pet por invoice (para exibição)
  const invIds = [...new Set(insts.map(i => i.invoice_id).filter(Boolean))] as string[]
  const petByInvoice = new Map<string, string | null>()
  if (invIds.length) {
    const { data: invs } = await admin.from('invoices').select('id, patient_id').in('id', invIds)
    const patIds = [...new Set((invs ?? []).map((i: any) => i.patient_id).filter(Boolean))] as string[]
    const patMap = new Map<string, string>()
    if (patIds.length) { const { data: pats } = await admin.from('patients').select('id, name').in('id', patIds); for (const p of pats ?? []) patMap.set(p.id, (p as any).name) }
    for (const i of (invs ?? []) as any[]) petByInvoice.set(i.id, i.patient_id ? (patMap.get(i.patient_id) ?? null) : null)
  }

  const byNsu = new Map<string, any[]>()
  for (const i of insts) { const k = (i.card_nsu ?? '').trim(); if (k) { const a = byNsu.get(k) ?? []; a.push(i); byNsu.set(k, a) } }
  const eq = (a: number | null, b: number) => a != null && Math.abs(a - b) <= 0.01

  const used = new Set<string>()
  const rowsOut: MatchedRow[] = rows.map(st => {
    let inst: any = null
    if (st.nsu) {
      const cands = (byNsu.get(st.nsu.trim()) ?? []).filter(i => !used.has(i.id))
      // desempata (mesmo NSU em várias parcelas): bruto + nº da parcela → bruto → parcela → 1º livre
      const byParc = (i: any) => st.installment == null || i.installment_number === st.installment
      inst = cands.find(i => eq(st.gross, Number(i.gross_amount)) && byParc(i))
          ?? cands.find(i => eq(st.gross, Number(i.gross_amount)))
          ?? cands.find(byParc)
          ?? cands[0] ?? null
    }
    if (!inst) return { statement: st, installment_id: null, status: 'not_found', diffs: [], system: null }
    used.add(inst.id)
    const sys = {
      gross: Number(inst.gross_amount), net: Number(inst.net_amount), fee: Number(inst.fee_amount),
      nsu: inst.card_nsu ?? null, brand: inst.card_brand ?? null,
      installment_number: inst.installment_number, total_installments: inst.total_installments,
      expected_settlement_date: inst.expected_settlement_date,
      patient_name: inst.invoice_id ? (petByInvoice.get(inst.invoice_id) ?? null) : null,
    }
    if (inst.status === 'reconciled') return { statement: st, installment_id: inst.id, status: 'already', diffs: [], system: sys }
    const diffs: string[] = []
    if (st.gross != null && !eq(st.gross, sys.gross)) diffs.push('bruto')
    if (st.net   != null && !eq(st.net,   sys.net))   diffs.push('líquido')
    if (st.fee   != null && !eq(st.fee,   sys.fee))   diffs.push('taxa')
    if (st.brand && sys.brand && st.brand.toLowerCase() !== sys.brand.toLowerCase()) diffs.push('bandeira')
    if (st.installment != null && st.installment !== sys.installment_number) diffs.push('parcela')
    return { statement: st, installment_id: inst.id, status: diffs.length ? 'divergent' : 'linked', diffs, system: sys }
  })

  const summary = {
    linked:    rowsOut.filter(r => r.status === 'linked').length,
    divergent: rowsOut.filter(r => r.status === 'divergent').length,
    not_found: rowsOut.filter(r => r.status === 'not_found').length,
    already:   rowsOut.filter(r => r.status === 'already').length,
    total:     rowsOut.length,
  }
  return { rows: rowsOut, summary }
}

// ─── Baixa (conciliação) ──────────────────────────────────────────────────────
// Marca as parcelas como reconciliadas + baixa o A Receber de cartão (a operadora
// repassou). Idempotente: já reconciliadas são ignoradas. Recebe os itens a
// conciliar (parcela + valores do extrato — para divergentes, atualiza).
export async function reconcileCardInstallments(items: Array<{
  installment_id: string
  settled_net: number
  settlement_date?: string | null
  apply_statement?: { gross?: number; net?: number; fee?: number; brand?: string | null } | null
}>): Promise<{ ok: true; reconciled: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Sem permissão para conciliar.' }
  if (!items.length) return { error: 'Nada para conciliar.' }
  const admin = createAdminClient()
  const today = new Date().toISOString()

  const ids = items.map(i => i.installment_id)
  const { data: insts } = await admin
    .from('card_installments')
    .select('id, status, pending_entry_id')
    .eq('clinic_id', ctx.clinic_id).in('id', ids)
  const byId = new Map((insts ?? []).map((i: any) => [i.id, i]))

  let reconciled = 0
  for (const it of items) {
    const inst = byId.get(it.installment_id)
    if (!inst || inst.status === 'reconciled') continue   // idempotência
    const upd: any = { status: 'reconciled', reconciled_at: today, settled_at: today, settled_amount: it.settled_net, updated_at: today }
    if (it.settlement_date) upd.expected_settlement_date = it.settlement_date
    if (it.apply_statement?.gross != null) upd.gross_amount = it.apply_statement.gross
    if (it.apply_statement?.net   != null) upd.net_amount   = it.apply_statement.net
    if (it.apply_statement?.fee   != null) upd.fee_amount   = it.apply_statement.fee
    if (it.apply_statement?.brand)         upd.card_brand   = it.apply_statement.brand
    await admin.from('card_installments').update(upd).eq('id', inst.id).eq('clinic_id', ctx.clinic_id)

    // baixa o A Receber de cartão (operadora repassou → entra no banco)
    if (inst.pending_entry_id) {
      await admin.from('financial_entries')
        .update({ status: 'paid', payment_date: today.slice(0, 10), updated_at: today })
        .eq('id', inst.pending_entry_id).eq('status', 'pending')
    }
    reconciled++
  }

  revalidatePath('/dashboard/financial')
  revalidatePath('/dashboard/financial/cards')
  return { ok: true, reconciled }
}

// ─── Incluir "não encontrados" (movimentação avulsa) + baixar ─────────────────
// Para linhas do extrato que NÃO existem no sistema: cria a movimentação de
// cartão (card_installments avulso, sem venda vinculada) já com o A Receber de
// cartão e baixa na mesma ação (a operadora repassou). O título de origem no
// caixa não é criado aqui — só a movimentação do cartão, conforme o fluxo real.
export async function includeCardMovements(rows: StatementRow[]): Promise<{ ok: true; included: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Sem permissão para incluir movimentações.' }
  if (!rows.length) return { error: 'Nada para incluir.' }
  const admin = createAdminClient()
  const today = new Date().toISOString()
  const todayD = today.slice(0, 10)

  let included = 0
  for (const st of rows) {
    const gross = st.gross ?? st.net ?? 0
    const net   = st.net ?? gross
    if (net <= 0 && gross <= 0) continue
    const fee   = st.fee ?? Math.max(0, Math.round((gross - net) * 100) / 100)
    const feePct = gross > 0 ? Math.round((fee / gross) * 10000) / 100 : 0
    const inst  = st.installment ?? 1
    const tot   = st.total_installments ?? 1
    const settle = st.settlement_date ?? todayD
    const label = `Cartão avulso (conciliação)${st.brand ? ` · ${st.brand}` : ''} · ${inst}/${tot} · NSU ${st.nsu ?? '—'}`

    // A Receber de cartão avulso — nasce já baixado (repasse confirmado no extrato).
    // Valor = líquido efetivamente creditado, para casar na conciliação bancária.
    const { data: fe, error: feErr } = await admin.from('financial_entries').insert({
      clinic_id: ctx.clinic_id, type: 'receivable', description: label, amount: net,
      due_date: settle, payment_date: settle, status: 'paid',
      source: 'card_acquirer', category: 'A receber de cartão', payment_method: 'credit',
      created_by: ctx.user_id,
    }).select('id').single()
    if (feErr || !fe) continue

    const { error: ciErr } = await admin.from('card_installments').insert({
      clinic_id: ctx.clinic_id, split_id: null, invoice_id: null,
      installment_number: inst, total_installments: tot, payment_method: 'credit',
      card_brand: st.brand, card_nsu: st.nsu,
      gross_amount: gross, fee_percent: feePct, fee_amount: fee, net_amount: net,
      expected_settlement_date: settle, status: 'reconciled',
      settled_amount: net, settled_at: today, reconciled_at: today,
      pending_entry_id: fe.id,
    })
    if (ciErr) { await admin.from('financial_entries').delete().eq('id', fe.id); continue }
    included++
  }

  revalidatePath('/dashboard/financial')
  revalidatePath('/dashboard/financial/cards')
  return { ok: true, included }
}
