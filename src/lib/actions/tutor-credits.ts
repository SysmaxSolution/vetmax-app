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
  invoice_id: string | null
  created_at: string
}

export interface ClinicCreditSummary {
  tutor_id: string
  tutor_name: string
  total_inserted: number   // adiantamentos + transferências recebidas
  total_used: number       // usos + transferências enviadas (valor absoluto)
  available: number        // saldo líquido disponível
}

const round2 = (v: number) => Math.round(v * 100) / 100

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
    .select('id, amount, kind, reference, company_id, invoice_id, created_at')
    .eq('clinic_id', ctx.clinic_id)
    .eq('tutor_id', tutorId)
    .order('created_at', { ascending: false })
  if (error) return { error: `Erro ao listar movimentos: ${error.message}` }
  return (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) })) as TutorCreditMovement[]
}

export interface TutorCreditDetail {
  id: string
  kind: string                    // 'advance' | 'usage'
  amount: number
  created_at: string              // quando foi inserido / utilizado
  user_name: string | null        // quem inseriu / utilizou
  reference: string | null
  // adiantamento (advance):
  payment_method: string | null   // forma de recebimento
  // uso (usage):
  invoice_id: string | null
  os_number: string | null
  patient_name: string | null
  tutor_name: string | null
  consultation_date: string | null
}

// Extrato DETALHADO do crédito de um tutor (para os modais de detalhe).
export async function getTutorCreditStatement(tutorId: string): Promise<TutorCreditDetail[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()

  const { data: movsRaw, error } = await admin
    .from('tutor_credits')
    .select('id, kind, amount, reference, invoice_id, cashier_entry_id, created_by, created_at')
    .eq('clinic_id', ctx.clinic_id).eq('tutor_id', tutorId)
    .in('kind', ['advance', 'usage'])
    .order('created_at', { ascending: false })
  if (error) return { error: `Erro ao carregar extrato: ${error.message}` }
  const movs = (movsRaw ?? []) as any[]
  if (movs.length === 0) return []

  const uniq = (arr: any[]) => [...new Set(arr.filter(Boolean))] as string[]

  // usuários
  const userMap = new Map<string, string>()
  const userIds = uniq(movs.map(m => m.created_by))
  if (userIds.length) {
    const { data: profs } = await admin.from('profiles').select('id, full_name').in('id', userIds)
    for (const p of (profs ?? []) as any[]) userMap.set(p.id, p.full_name ?? '—')
  }

  // caixa (adiantamentos) → forma de recebimento
  const ccMap = new Map<string, string | null>()
  const ccIds = uniq(movs.filter(m => m.kind === 'advance').map(m => m.cashier_entry_id))
  if (ccIds.length) {
    const { data: cc } = await admin.from('central_cashier').select('id, payment_method').in('id', ccIds)
    for (const c of (cc ?? []) as any[]) ccMap.set(c.id, c.payment_method ?? null)
  }

  // faturas (usos) → OS, pet, tutor, data da consulta
  const invMap = new Map<string, { os_number: string | null; patient_name: string | null; tutor_name: string | null; consultation_date: string | null }>()
  const invoiceIds = uniq(movs.filter(m => m.kind === 'usage').map(m => m.invoice_id))
  if (invoiceIds.length) {
    const { data: invs } = await admin.from('invoices').select('id, consultation_id, patient_id, tutor_id').in('id', invoiceIds)
    const invsA = (invs ?? []) as any[]
    const consMap = new Map<string, { os_number: string | null; created_at: string | null }>()
    const consIds = uniq(invsA.map(i => i.consultation_id))
    if (consIds.length) {
      const { data: cons } = await admin.from('consultations').select('id, os_number, created_at').in('id', consIds)
      for (const c of (cons ?? []) as any[]) consMap.set(c.id, { os_number: c.os_number ?? null, created_at: c.created_at ?? null })
    }
    const patMap = new Map<string, string>()
    const patIds = uniq(invsA.map(i => i.patient_id))
    if (patIds.length) {
      const { data: pats } = await admin.from('patients').select('id, name').in('id', patIds)
      for (const p of (pats ?? []) as any[]) patMap.set(p.id, p.name)
    }
    const tutMap = new Map<string, string>()
    const tutIds = uniq(invsA.map(i => i.tutor_id))
    if (tutIds.length) {
      const { data: tuts } = await admin.from('tutors').select('id, name').in('id', tutIds)
      for (const t of (tuts ?? []) as any[]) tutMap.set(t.id, t.name)
    }
    for (const i of invsA) {
      const cons = i.consultation_id ? consMap.get(i.consultation_id) : null
      invMap.set(i.id, {
        os_number: cons?.os_number ?? null,
        patient_name: i.patient_id ? (patMap.get(i.patient_id) ?? null) : null,
        tutor_name: i.tutor_id ? (tutMap.get(i.tutor_id) ?? null) : null,
        consultation_date: cons?.created_at ?? null,
      })
    }
  }

  return movs.map(m => {
    const iv = m.invoice_id ? invMap.get(m.invoice_id) : null
    return {
      id: m.id, kind: m.kind, amount: Number(m.amount), created_at: m.created_at,
      user_name: m.created_by ? (userMap.get(m.created_by) ?? null) : null,
      reference: m.reference ?? null,
      payment_method: m.kind === 'advance' ? (m.cashier_entry_id ? (ccMap.get(m.cashier_entry_id) ?? null) : null) : null,
      invoice_id: m.invoice_id ?? null,
      os_number: iv?.os_number ?? null,
      patient_name: iv?.patient_name ?? null,
      tutor_name: iv?.tutor_name ?? null,
      consultation_date: iv?.consultation_date ?? null,
    }
  })
}

// Resumo de crédito de TODOS os clientes da clínica (tela "Créditos de clientes").
export async function listClinicTutorCredits(): Promise<ClinicCreditSummary[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tutor_credits')
    .select('tutor_id, amount, kind, tutors(name)')
    .eq('clinic_id', ctx.clinic_id)
  if (error) return { error: `Erro ao carregar créditos: ${error.message}` }

  const map = new Map<string, ClinicCreditSummary>()
  for (const r of (data ?? []) as any[]) {
    const id = r.tutor_id as string
    if (!id) continue
    const name = Array.isArray(r.tutors) ? r.tutors[0]?.name : r.tutors?.name
    const v = Number(r.amount)
    let s = map.get(id)
    if (!s) { s = { tutor_id: id, tutor_name: name ?? '—', total_inserted: 0, total_used: 0, available: 0 }; map.set(id, s) }
    // Saldo líquido considera TODOS os movimentos (transferências se anulam).
    s.available += v
    // Inserido/Utilizado contam SÓ entrada e uso reais — transfer_in/transfer_out
    // são internos (transferência entre CNPJs do mesmo cliente) e não devem inflar.
    if (r.kind === 'advance')    s.total_inserted += v
    else if (r.kind === 'usage') s.total_used     += -v
  }
  return [...map.values()]
    .map(s => ({ ...s, total_inserted: round2(s.total_inserted), total_used: round2(s.total_used), available: round2(s.available) }))
    .filter(s => s.total_inserted > 0.005)
    .sort((a, b) => b.available - a.available || a.tutor_name.localeCompare(b.tutor_name))
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

  // 3) O adiantamento é um RECEBIMENTO REAL (entrou no caixa/banco AGORA — Dia 1)
  // e deve ser conciliável na data e conta corretas. O trigger já espelhou a
  // entrada como título RECEBIDO (receivable, paid); aqui só categorizamos como
  // "Adiantamento de cliente" (não é receita de consulta) e vinculamos ao tutor
  // (extrato). NÃO viramos crédito negativo: o dinheiro do adiantamento é o
  // recebimento do Dia 1; o USO do crédito depois é um ABATIMENTO na consulta
  // (não gera recebimento novo) — ver applyTutorCreditToInvoice.
  if (cashierId) {
    await admin
      .from('financial_entries')
      .update({
        category:    'Adiantamento de cliente',
        tutor_id:    input.tutor_id,
        description: `Adiantamento de cliente — ${tutorName}${input.notes ? ` · ${input.notes}` : ''}`,
        updated_at:  new Date().toISOString(),
      })
      .eq('clinic_id', ctx.clinic_id)
      .eq('cashier_entry_id', cashierId as string)
  }

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

  // 2) Empresa faturante (âncora da OS) + nº da OS (para o histórico no adiantamento)
  let billingCompany: string | null = null
  let osNumber: string | null = null
  if ((inv as { consultation_id?: string }).consultation_id) {
    const { data: cons } = await admin
      .from('consultations').select('billing_company_id, os_number')
      .eq('id', (inv as { consultation_id?: string }).consultation_id!).maybeSingle()
    billingCompany = (cons?.billing_company_id as string | null) ?? null
    osNumber = (cons?.os_number as string | null) ?? null
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

  // 7) O uso do crédito NÃO gera recebimento novo — é um ABATIMENTO. O dinheiro
  //    já foi recebido no adiantamento (Dia 1, conciliável na conta/data certas).
  //    Aqui apenas abatemos o saldo da fatura e registramos a baixa do crédito no
  //    EXTRATO (movimentos tutor_credits acima, vinculados a invoice_id). Só o
  //    valor pago em dinheiro no caixa (ex.: pix no checkout) vira recebimento
  //    conciliável. Isso evita o "recebido" dobrado e mantém a conciliação certa.

  // 8) Abate o saldo da fatura + reconcilia o saldo pendente

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

  // 9) Histórico de USO no título do ADIANTAMENTO (contas a receber): anexa
  // "Utilizado R$X na OS ... — dd/mm/aaaa hh:mm" ao(s) título(s) de adiantamento
  // do tutor, para o financeiro ver de onde saiu o crédito. Também registrado no
  // extrato (tutor_credits) com invoice_id.
  const stamp = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date()).replace(',', '')
  const docLabel = osNumber ? `OS ${osNumber}` : `fatura ${short}`
  const usageNote = `Utilizado R$ ${amount.toFixed(2)} na ${docLabel} — ${stamp}`
  const { data: advTitles } = await admin
    .from('financial_entries')
    .select('id, notes')
    .eq('clinic_id', ctx.clinic_id)
    .eq('tutor_id', tutorId)
    .eq('category', 'Adiantamento de cliente')
    .order('created_at', { ascending: false })
    .limit(1)
  if (advTitles && advTitles.length > 0) {
    const cur = (advTitles[0] as { notes?: string | null }).notes
    await admin.from('financial_entries')
      .update({ notes: cur ? `${cur}\n${usageNote}` : usageNote, updated_at: new Date().toISOString() })
      .eq('id', advTitles[0].id)
  }

  // 10) CAIXA CENTRAL: o título da consulta deixa de ficar pendente e passa a
  // constar RECEBIDO com a modalidade "Utilização de crédito". Não gera dinheiro
  // novo nem financial_entry (trigger 0427 pula source_module='consultation') — o
  // recebimento em dinheiro já foi o adiantamento; aqui é só a baixa operacional
  // do título pela via do crédito, para o caixa não mostrá-lo pendente.
  const consultationId = (inv as { consultation_id?: string }).consultation_id
  if (consultationId) {
    const { data: ccPend } = await admin.from('central_cashier')
      .select('id, tutor_name, patient_name, session_id, effective_date')
      .eq('clinic_id', ctx.clinic_id).eq('source_module', 'consultation')
      .eq('source_id', input.invoice_id).eq('status', 'pending')
      .order('created_at', { ascending: true }).limit(1).maybeSingle()

    await admin.from('central_cashier').insert({
      clinic_id: ctx.clinic_id, source_module: 'consultation', source_id: input.invoice_id,
      amount, status: 'recorded', payment_method: 'credit_balance',
      reason: `Recebimento por utilização de crédito · ${docLabel}`,
      patient_name:   (ccPend?.patient_name as string) ?? patName ?? null,
      tutor_name:     (ccPend?.tutor_name as string) ?? null,
      effective_date: (ccPend?.effective_date as string) ?? new Date().toISOString().slice(0, 10),
      session_id:     (ccPend?.session_id as string) ?? null,
      recorded_by:    ctx.user_id,
    })

    if (ccPend) {
      if (newBalance <= 0.005) {
        await admin.from('central_cashier').update({ status: 'archived' }).eq('id', (ccPend as { id: string }).id)
      } else {
        await admin.from('central_cashier').update({ amount: newBalance }).eq('id', (ccPend as { id: string }).id)
      }
    }
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
