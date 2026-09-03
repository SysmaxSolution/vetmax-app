'use server'

// 1.10 · PAGFOR — Pagamento a Fornecedores (GRUPO A, contas a pagar).
// Fluxo: importar DDA (boletos emitidos contra o CNPJ da clínica) → cruzar com os
// títulos a pagar (legenda verde = já no sistema / vermelho = não está) → lançar os
// que faltam "mantendo os dados" + agendar pagamento (vencimento ou data X) →
// gerar remessa PAGFOR. A remessa real (CNAB 240 / API) depende do convênio do
// banco do cliente; por ora gera um rascunho estruturado para conferência.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantCtx } from '@/lib/data/context'
import { revalidatePath } from 'next/cache'

async function ctx() {
  const t = await getTenantCtx()
  if (!t?.clinicId) return null
  return { clinicId: t.clinicId, role: t.role }
}
async function userId() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  return user?.id ?? null
}

// Boleto vindo do DDA (saída do parser).
export interface DdaBoleto {
  barcode:         string | null   // linha digitável / código de barras
  beneficiary:     string | null   // nome do beneficiário (fornecedor)
  beneficiary_doc: string | null   // CNPJ/CPF do beneficiário
  amount:          number | null
  due_date:        string | null   // YYYY-MM-DD
  document:        string | null   // nº do documento / nota
  raw:             string
}

export interface DdaMatchRow {
  boleto:   DdaBoleto
  status:   'in_system' | 'not_in_system'   // verde | vermelho
  entry_id: string | null
  entry_scheduled: string | null            // scheduled_payment_date do título casado
}

export interface DdaMatchResult {
  rows:    DdaMatchRow[]
  summary: { in_system: number; not_in_system: number; total: number }
}

const onlyDigits = (s: string | null) => (s ?? '').replace(/\D/g, '')
const eqAmt = (a: number | null, b: number) => a != null && Math.abs(a - b) <= 0.01

// Cruza os boletos do DDA com os títulos a pagar pendentes.
export async function matchDdaBoletos(boletos: DdaBoleto[]): Promise<DdaMatchResult | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: payablesRaw } = await admin
    .from('financial_entries')
    .select('id, amount, due_date, description, beneficiary, barcode, scheduled_payment_date')
    .eq('clinic_id', c.clinicId).eq('type', 'payable').eq('status', 'pending')
  const payables = (payablesRaw ?? []) as Array<Record<string, unknown>>

  const used = new Set<string>()
  const rows: DdaMatchRow[] = boletos.map(b => {
    const bDigits = onlyDigits(b.barcode)
    const bName = (b.beneficiary ?? '').toLowerCase().trim()
    const hit = payables.find(p => {
      if (used.has(p.id as string)) return false
      // 1) casa por código de barras (forte)
      if (bDigits && onlyDigits(p.barcode as string) === bDigits) return true
      // 2) casa por valor + vencimento (±2d) + beneficiário aproximado
      if (!eqAmt(b.amount, Number(p.amount))) return false
      if (b.due_date && p.due_date) {
        const dd = Math.abs(new Date(b.due_date).getTime() - new Date(p.due_date as string).getTime()) / 86400000
        if (dd > 2) return false
      }
      if (bName) {
        const pName = String(p.beneficiary ?? p.description ?? '').toLowerCase()
        if (!pName.includes(bName) && !bName.includes(pName.slice(0, 8))) return false
      }
      return true
    })
    if (hit) {
      used.add(hit.id as string)
      return { boleto: b, status: 'in_system', entry_id: hit.id as string, entry_scheduled: (hit.scheduled_payment_date as string) ?? null }
    }
    return { boleto: b, status: 'not_in_system', entry_id: null, entry_scheduled: null }
  })

  return {
    rows,
    summary: {
      in_system:     rows.filter(r => r.status === 'in_system').length,
      not_in_system: rows.filter(r => r.status === 'not_in_system').length,
      total:         rows.length,
    },
  }
}

// Lança no sistema (contas a pagar) os boletos que não estavam — mantendo os dados.
export async function insertPayablesFromDda(boletos: DdaBoleto[]): Promise<{ ok: true; inserted: number } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const uid = await userId()
  let inserted = 0
  for (const b of boletos) {
    const amount = b.amount ?? 0
    if (amount <= 0) continue
    const { error } = await admin.from('financial_entries').insert({
      clinic_id: c.clinicId, type: 'payable',
      description: b.beneficiary || b.document || 'Boleto (DDA)',
      beneficiary: b.beneficiary ?? null, barcode: b.barcode ?? null,
      amount, due_date: b.due_date ?? new Date().toISOString().slice(0, 10),
      issue_date: new Date().toISOString().slice(0, 10),
      status: 'pending', source: 'manual', category: 'Fornecedores',
      created_by: uid,
    })
    if (!error) inserted++
  }
  revalidatePath('/dashboard/financial')
  return { ok: true, inserted }
}

// Agenda o pagamento (no vencimento de cada título, ou numa data X).
export async function schedulePayments(params: {
  entry_ids: string[]
  scheduled_date?: string | null   // null/omitido = usar o vencimento de cada título
}): Promise<{ ok: true; scheduled: number } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!params.entry_ids.length) return { error: 'Nenhum título selecionado.' }
  const admin = createAdminClient()
  let scheduled = 0
  for (const id of params.entry_ids) {
    let date = params.scheduled_date ?? null
    if (!date) {
      const { data } = await admin.from('financial_entries').select('due_date').eq('id', id).eq('clinic_id', c.clinicId).single()
      date = (data?.due_date as string) ?? null
    }
    if (!date) continue
    const { error } = await admin.from('financial_entries')
      .update({ scheduled_payment_date: date, updated_at: new Date().toISOString() })
      .eq('id', id).eq('clinic_id', c.clinicId).eq('type', 'payable')
    if (!error) scheduled++
  }
  revalidatePath('/dashboard/financial')
  return { ok: true, scheduled }
}

// Gera um rascunho de remessa (conferência). CNAB 240 real / API do banco dependem
// do convênio do cliente (agência, conta, nº convênio) → plugam depois.
export async function generatePagforRemittance(entry_ids: string[]): Promise<{ content: string; filename: string; count: number } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!entry_ids.length) return { error: 'Nenhum título selecionado.' }
  const admin = createAdminClient()
  const { data } = await admin.from('financial_entries')
    .select('beneficiary, description, barcode, amount, due_date, scheduled_payment_date')
    .eq('clinic_id', c.clinicId).in('id', entry_ids).eq('type', 'payable')
  const rows = (data ?? []) as Array<Record<string, unknown>>
  const head = 'beneficiario;codigo_barras;valor;vencimento;data_pagamento'
  const body = rows.map(r => [
    String(r.beneficiary ?? r.description ?? '').replace(/;/g, ','),
    onlyDigits(r.barcode as string),
    Number(r.amount).toFixed(2).replace('.', ','),
    (r.due_date as string) ?? '',
    (r.scheduled_payment_date as string) ?? (r.due_date as string) ?? '',
  ].join(';'))
  return {
    content: [head, ...body].join('\r\n'),
    filename: `pagfor_remessa_${new Date().toISOString().slice(0, 10)}.csv`,
    count: rows.length,
  }
}
