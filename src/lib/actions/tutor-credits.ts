'use server'

// Adiantamento / crédito do tutor (Sprint Animais, Fase 1, item 1.6).
// Razão de movimentos (tutor_credits): saldo = SUM(amount). O adiantamento é
// dinheiro recebido AGORA (entra no Caixa) e vira crédito para uso futuro.
// O USO do crédito no recebimento (com transferência inter-CNPJ) é o próximo
// checkpoint (mexe no billing). Tabela com RLS sem policy → service role.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface TutorCreditMovement {
  id: string
  amount: number
  kind: string
  reference: string | null
  company_id: string | null
  created_at: string
}

export interface TutorCreditBalance {
  total: number
  byCompany: { company_id: string | null; amount: number }[]
}

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { clinic_id: profile.clinic_id as string, user_id: user.id, role: profile.role as string }
}

export async function getTutorCreditBalance(tutorId: string): Promise<TutorCreditBalance | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tutor_credits')
    .select('amount, company_id')
    .eq('clinic_id', ctx.clinic_id)
    .eq('tutor_id', tutorId)
  if (error) return { error: `Erro ao carregar crédito: ${error.message}` }

  const byCompanyMap = new Map<string | null, number>()
  let total = 0
  for (const row of (data ?? []) as { amount: number; company_id: string | null }[]) {
    const v = Number(row.amount)
    total += v
    byCompanyMap.set(row.company_id, (byCompanyMap.get(row.company_id) ?? 0) + v)
  }
  return {
    total: Math.round(total * 100) / 100,
    byCompany: [...byCompanyMap.entries()].map(([company_id, amount]) => ({ company_id, amount: Math.round(amount * 100) / 100 })),
  }
}

export async function listTutorCredits(tutorId: string): Promise<TutorCreditMovement[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tutor_credits')
    .select('id, amount, kind, reference, company_id, created_at')
    .eq('clinic_id', ctx.clinic_id)
    .eq('tutor_id', tutorId)
    .order('created_at', { ascending: false })
  if (error) return { error: `Erro ao listar movimentos: ${error.message}` }
  return (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) })) as TutorCreditMovement[]
}

// Lança um ADIANTAMENTO: recebe o dinheiro no Caixa AGORA + credita o tutor.
export async function addTutorAdvance(input: {
  tutor_id: string
  amount: number
  company_id?: string | null
  payment_method?: string
  notes?: string
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager', 'receptionist'].includes(ctx.role))
    return { error: 'Sem permissão para lançar adiantamento' }

  const amount = Math.round(Number(input.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Informe um valor válido (> 0)' }

  const supabase = await createClient()
  const admin = createAdminClient()

  // Nome do tutor para a descrição do caixa
  const { data: tutor } = await admin
    .from('tutors').select('name').eq('id', input.tutor_id).eq('clinic_id', ctx.clinic_id).maybeSingle()
  const tutorName = (tutor?.name as string) ?? 'tutor'

  // 1) Entrada no Caixa (dinheiro recebido agora)
  const { data: cashierId, error: cashErr } = await supabase.rpc('rpc_record_manual_inflow', {
    p_clinic_id:      ctx.clinic_id,
    p_amount:         amount,
    p_reason:         `Adiantamento — ${tutorName}${input.notes ? ` (${input.notes})` : ''}`,
    p_recorded_by:    ctx.user_id,
    p_payment_method: input.payment_method ?? 'cash',
    p_effective_date: null,
  })
  if (cashErr) return { error: `Erro ao lançar no caixa: ${cashErr.message}` }

  // 2) Credita o tutor (razão)
  const { error: credErr } = await admin.from('tutor_credits').insert({
    clinic_id:        ctx.clinic_id,
    tutor_id:         input.tutor_id,
    company_id:       input.company_id || null,
    amount,                                   // + entrada
    kind:             'advance',
    reference:        `Adiantamento${input.notes ? ` — ${input.notes}` : ''}`,
    cashier_entry_id: (cashierId as string) ?? null,
    created_by:       ctx.user_id,
  })
  if (credErr) return { error: `Caixa lançado, mas falhou ao creditar o tutor: ${credErr.message}` }

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/financial')
  return { ok: true }
}

// Usa o crédito/adiantamento do tutor para ABATER uma fatura. Debita o razão
// (kind='usage'). Quando o crédito está numa empresa (CNPJ) diferente da empresa
// faturante da OS (consultations.billing_company_id), registra a TRANSFERÊNCIA
// inter-CNPJ (transfer_out na origem + transfer_in na faturante) antes do usage.
// NÃO lança dinheiro novo no caixa — o dinheiro já entrou quando o adiantamento
// foi recebido; aqui é apenas alocação do crédito pré-existente contra a fatura.
export async function applyTutorCreditToInvoice(input: {
  invoice_id: string
  amount: number
}): Promise<{ ok: true; applied: number; remaining_balance: number; credit_left: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager', 'receptionist'].includes(ctx.role))
    return { error: 'Sem permissão para usar crédito.' }

  const admin = createAdminClient()

  // 1) Fatura + saldo
  const { data: inv } = await admin
    .from('invoices')
    .select('id, total_amount, paid_amount, status, tutor_id, patient_id, consultation_id, patients(name)')
    .eq('id', input.invoice_id)
    .eq('clinic_id', ctx.clinic_id)
    .single()
  if (!inv) return { error: 'Fatura não encontrada.' }
  const total   = Number((inv as { total_amount?: number }).total_amount ?? 0)
  const paid    = Number((inv as { paid_amount?: number }).paid_amount ?? 0)
  const balance = Math.round(Math.max(0, total - paid) * 100) / 100
  if (balance <= 0.005) return { error: 'Esta fatura já está quitada.' }
  const tutorId = (inv as { tutor_id?: string }).tutor_id
  if (!tutorId) return { error: 'Fatura sem tutor vinculado.' }

  // 2) Empresa faturante (âncora da OS)
  let billingCompany: string | null = null
  if ((inv as { consultation_id?: string }).consultation_id) {
    const { data: cons } = await admin
      .from('consultations').select('billing_company_id')
      .eq('id', (inv as { consultation_id?: string }).consultation_id!).maybeSingle()
    billingCompany = (cons?.billing_company_id as string | null) ?? null
  }

  // 3) Saldo de crédito por empresa
  const { data: creditRows } = await admin
    .from('tutor_credits').select('amount, company_id')
    .eq('clinic_id', ctx.clinic_id).eq('tutor_id', tutorId)
  const byCompany = new Map<string | null, number>()
  let totalCredit = 0
  for (const r of (creditRows ?? []) as { amount: number; company_id: string | null }[]) {
    const v = Number(r.amount); totalCredit += v
    byCompany.set(r.company_id, (byCompany.get(r.company_id) ?? 0) + v)
  }
  totalCredit = Math.round(totalCredit * 100) / 100
  if (totalCredit <= 0.005) return { error: 'Tutor sem saldo de crédito.' }

  // 4) Valor a aplicar (limitado por saldo do crédito e saldo da fatura)
  const amount = Math.min(
    Math.round(Number(input.amount) * 100) / 100,
    balance,
    totalCredit,
  )
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Valor de crédito inválido.' }

  const pats = (inv as { patients?: { name?: string } | { name?: string }[] }).patients
  const patName = Array.isArray(pats) ? pats[0]?.name : pats?.name
  const short = input.invoice_id.slice(0, 8)
  const usageRef = `Uso na fatura ${short}${patName ? ` · ${patName}` : ''}`

  // 5) Aloca: crédito da própria empresa faturante primeiro; depois transfere das outras
  const movements: Array<{ company_id: string | null; amount: number; kind: string; reference: string }> = []
  const companiesOrdered = [...byCompany.keys()].sort(
    (a, b) => (a === billingCompany ? -1 : b === billingCompany ? 1 : 0),
  )
  let need = amount
  for (const comp of companiesOrdered) {
    if (need <= 0.005) break
    const avail = byCompany.get(comp) ?? 0
    if (avail <= 0.005) continue
    const take = Math.round(Math.min(need, avail) * 100) / 100
    if (comp === billingCompany) {
      movements.push({ company_id: billingCompany, amount: -take, kind: 'usage', reference: usageRef })
    } else {
      movements.push({ company_id: comp,           amount: -take, kind: 'transfer_out', reference: `Transferência p/ fatura ${short}` })
      movements.push({ company_id: billingCompany, amount:  take, kind: 'transfer_in',  reference: `Transferência de crédito · fatura ${short}` })
      movements.push({ company_id: billingCompany, amount: -take, kind: 'usage',         reference: usageRef })
    }
    need -= take
  }

  // 6) Grava os movimentos do razão
  const { error: movErr } = await admin.from('tutor_credits').insert(
    movements.map(m => ({
      clinic_id: ctx.clinic_id, tutor_id: tutorId, company_id: m.company_id,
      amount: m.amount, kind: m.kind, reference: m.reference,
      invoice_id: input.invoice_id, created_by: ctx.user_id,
    })),
  )
  if (movErr) return { error: `Falha ao debitar o crédito: ${movErr.message}` }

  // 7) Lançamento PAGO documentando o pagamento por crédito (NÃO entra no caixa —
  //    o dinheiro já entrou no adiantamento).
  await admin.from('financial_entries').insert({
    clinic_id:   ctx.clinic_id,
    type:        'receivable',
    description: `Pagamento com crédito · fatura ${short}${patName ? ` · ${patName}` : ''}`,
    amount,
    due_date:     new Date().toISOString().slice(0, 10),
    payment_date: new Date().toISOString().slice(0, 10),
    status:      'paid',
    source:      'cashier',
    category:    'Pagamento com crédito',
    payment_method: 'credit',
    tutor_id:    tutorId,
    patient_id:  (inv as { patient_id?: string }).patient_id ?? null,
    invoice_id:  input.invoice_id,
    created_by:  ctx.user_id,
  })

  // 8) Atualiza a fatura + reconcilia o saldo pendente (um único, valor correto)
  const newPaid    = Math.round((paid + amount) * 100) / 100
  const newBalance = Math.max(0, Math.round((total - newPaid) * 100) / 100)
  const newStatus  = newBalance <= 0.005 ? 'paid' : 'paid_partial'
  await admin.from('invoices').update({
    paid_amount: newPaid,
    status:      newStatus,
    paid_at:     newStatus === 'paid' ? new Date().toISOString() : null,
    updated_at:  new Date().toISOString(),
  }).eq('id', input.invoice_id).eq('clinic_id', ctx.clinic_id)

  const { data: pendings } = await admin.from('financial_entries')
    .select('id').eq('clinic_id', ctx.clinic_id).eq('invoice_id', input.invoice_id)
    .eq('status', 'pending').eq('source', 'cashier').order('created_at', { ascending: true })
  const plist = (pendings ?? []) as { id: string }[]
  if (newBalance > 0.005) {
    if (plist.length > 0) {
      await admin.from('financial_entries')
        .update({ amount: newBalance, updated_at: new Date().toISOString() }).eq('id', plist[0].id)
      const extras = plist.slice(1).map(p => p.id)
      if (extras.length) await admin.from('financial_entries').delete().in('id', extras)
    }
  } else if (plist.length > 0) {
    await admin.from('financial_entries').delete().in('id', plist.map(p => p.id))
  }

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/financial')
  return {
    ok: true,
    applied: amount,
    remaining_balance: newBalance,
    credit_left: Math.round((totalCredit - amount) * 100) / 100,
  }
}
