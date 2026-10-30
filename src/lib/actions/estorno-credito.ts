'use server'

// Estorno que DEVOLVE o crédito ao tutor.
//
// Quando o tutor paga com crédito (adiantamento), o sistema abate a fatura,
// baixa o saldo no extrato (tutor_credits), reduz o título pendente do caixa
// e registra um lançamento "Utilização de crédito". O estorno comum — do
// título ou do lançamento do caixa — só desfazia a última peça: o crédito
// continuava consumido e o tutor ficava sem o dinheiro dele.
//
// Este módulo fica na frente dos dois estornos: se o que está sendo estornado
// é uma utilização de crédito, desfaz TUDO (saldo, fatura, título pendente,
// caixa); senão, delega para o estorno que já existia.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from '@/lib/errors'
import { reverseFinancialEntry } from '@/lib/actions/financial'
import { reverseCashierEntry } from '@/lib/actions/cashier-sessions'

const r2 = (v: number) => Math.round(v * 100) / 100

async function getCtx(): Promise<{ clinicId: string; userId: string; role: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id as string, userId: user.id, role: String(profile.role ?? '') }
}

interface TituloDeCredito {
  id: string
  amount: number
  invoice_id: string | null
  consultation_id: string | null
  tutor_id: string | null
  patient_id: string | null
  company_id: string | null
  description: string | null
  notes: string | null
  status: string
}

/**
 * Desfaz uma utilização de crédito. `titulo` é o receivable/paid com
 * payment_method = 'credit_balance' criado no uso.
 */
async function reverterUsoDeCredito(
  admin: ReturnType<typeof createAdminClient>,
  ctx: { clinicId: string; userId: string },
  titulo: TituloDeCredito,
  motivo: string,
): Promise<{ ok: true; devolvido: number } | { error: string }> {
  if (titulo.status === 'cancelled') return { error: 'Esta utilização de crédito já foi estornada.' }
  if (!titulo.invoice_id || !titulo.tutor_id) return { error: 'Utilização de crédito sem fatura ou sem responsável — não dá para estornar automaticamente.' }

  const invoiceId = titulo.invoice_id
  const short = invoiceId.slice(0, 8)

  // 1) Quanto deste uso ainda pode ser devolvido (uma fatura pode ter mais
  //    de um uso; cada estorno devolve só o valor do título estornado).
  const { data: movs } = await admin.from('tutor_credits')
    .select('amount, kind, reference')
    .eq('clinic_id', ctx.clinicId).eq('tutor_id', titulo.tutor_id).eq('invoice_id', invoiceId)
  let usado = 0, devolvidoAntes = 0
  for (const m of (movs ?? []) as { amount: number; kind: string; reference: string | null }[]) {
    if (m.kind === 'usage') usado += -Number(m.amount)
    if (m.kind === 'adjustment' && (m.reference ?? '').startsWith('Estorno do uso')) devolvidoAntes += Number(m.amount)
  }
  const disponivel = r2(usado - devolvidoAntes)
  const devolver = r2(Math.min(Number(titulo.amount), Math.max(0, disponivel)))
  if (devolver <= 0.005) return { error: 'O crédito desta fatura já foi devolvido ao responsável.' }

  // 2) Devolve o saldo no extrato do tutor, na empresa que o consumiu.
  //    (Transferências entre CNPJs feitas no uso permanecem: o dinheiro
  //    mudou de conta de fato; o que volta é o direito do tutor.)
  const { error: movErr } = await admin.from('tutor_credits').insert({
    clinic_id: ctx.clinicId, tutor_id: titulo.tutor_id, company_id: titulo.company_id,
    amount: devolver, kind: 'adjustment',
    reference: `Estorno do uso na fatura ${short} — ${motivo}`.slice(0, 250),
    invoice_id: invoiceId, created_by: ctx.userId,
  })
  if (movErr) return { error: `Falha ao devolver o crédito: ${mensagemErro(movErr, 'lib/actions/estorno-credito.ts')}` }

  // 3) A fatura volta a dever esse valor.
  const { data: inv } = await admin.from('invoices')
    .select('total_amount, paid_amount, patients ( name )')
    .eq('id', invoiceId).eq('clinic_id', ctx.clinicId).maybeSingle()
  const total = Number((inv as { total_amount?: number } | null)?.total_amount ?? 0)
  const pago  = Number((inv as { paid_amount?: number } | null)?.paid_amount ?? 0)
  const novoPago = r2(Math.max(0, pago - devolver))
  const saldo = r2(Math.max(0, total - novoPago))
  await admin.from('invoices').update({
    paid_amount: novoPago,
    status: novoPago <= 0.005 ? 'pending' : 'paid_partial',
    paid_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', invoiceId).eq('clinic_id', ctx.clinicId)
  const pats = (inv as { patients?: { name?: string } | { name?: string }[] } | null)?.patients
  const patName = Array.isArray(pats) ? pats[0]?.name : pats?.name

  // 4) O título pendente do caixa volta a cobrar o valor devolvido.
  if (saldo > 0.005) {
    const { data: pend } = await admin.from('financial_entries')
      .select('id, amount').eq('clinic_id', ctx.clinicId).eq('invoice_id', invoiceId)
      .eq('status', 'pending').eq('source', 'cashier').order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (pend) {
      await admin.from('financial_entries')
        .update({ amount: r2(Number((pend as { amount: number }).amount) + devolver), updated_at: new Date().toISOString() })
        .eq('id', (pend as { id: string }).id)
    } else {
      const hoje = new Date().toISOString().slice(0, 10)
      await admin.from('financial_entries').insert({
        clinic_id: ctx.clinicId, type: 'receivable', status: 'pending',
        description: `Saldo da fatura ${short}${patName ? ` · ${patName}` : ''} (crédito estornado)`,
        amount: devolver, due_date: hoje, issue_date: hoje,
        source: 'cashier', category: 'Recebimento de fatura',
        tutor_id: titulo.tutor_id, patient_id: titulo.patient_id, invoice_id: invoiceId,
        consultation_id: titulo.consultation_id, company_id: titulo.company_id,
        created_by: ctx.userId,
      })
    }
  }

  // 5) Caixa central: o título da consulta volta a aparecer pendente, e o
  //    lançamento "Utilização de crédito" fica marcado como estornado.
  if (titulo.consultation_id) {
    const { data: ccRows } = await admin.from('central_cashier')
      .select('id, status, amount, payment_method, reason, patient_name, tutor_name, session_id, effective_date')
      .eq('clinic_id', ctx.clinicId).eq('source_module', 'consultation').eq('source_id', invoiceId)
      .order('created_at', { ascending: true })
    const rows = (ccRows ?? []) as Array<{ id: string; status: string; amount: number; payment_method: string | null; patient_name: string | null; tutor_name: string | null; session_id: string | null; effective_date: string | null }>
    const uso = rows.find(r => r.payment_method === 'credit_balance' && r.status === 'recorded' && Math.abs(Number(r.amount) - Number(titulo.amount)) < 0.01)
      ?? rows.find(r => r.payment_method === 'credit_balance' && r.status === 'recorded')
    if (uso) {
      await admin.from('central_cashier').update({
        status: 'reversed', reversal_reason: motivo, reversed_at: new Date().toISOString(), reversed_by: ctx.userId,
      }).eq('id', uso.id)
    }
    if (saldo > 0.005) {
      const pendente = rows.find(r => r.status === 'pending' && r.payment_method !== 'credit_balance')
      const arquivado = rows.find(r => r.status === 'archived' && r.payment_method !== 'credit_balance')
      if (pendente) {
        await admin.from('central_cashier').update({ amount: r2(Number(pendente.amount) + devolver) }).eq('id', pendente.id)
      } else if (arquivado) {
        await admin.from('central_cashier').update({ status: 'pending', amount: devolver }).eq('id', arquivado.id)
      } else {
        const modelo = uso ?? rows[0]
        await admin.from('central_cashier').insert({
          clinic_id: ctx.clinicId, source_module: 'consultation', source_id: invoiceId,
          amount: devolver, status: 'pending',
          reason: `Saldo da fatura ${short} (crédito estornado)`,
          patient_name: modelo?.patient_name ?? patName ?? null, tutor_name: modelo?.tutor_name ?? null,
          effective_date: new Date().toISOString().slice(0, 10), session_id: modelo?.session_id ?? null,
          recorded_by: ctx.userId,
        })
      }
    }
  }

  // 6) O título "Serviço quitado com crédito" deixa de valer.
  const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date())
  await admin.from('financial_entries').update({
    status: 'cancelled',
    notes: [titulo.notes, `Estornado em ${quando} — crédito de R$ ${devolver.toFixed(2)} devolvido ao tutor. Motivo: ${motivo}`].filter(Boolean).join('\n'),
    updated_at: new Date().toISOString(),
  }).eq('id', titulo.id).eq('clinic_id', ctx.clinicId)

  await admin.from('audit_logs').insert({
    clinic_id: ctx.clinicId, user_id: ctx.userId, action: 'credit_usage_reversed',
    entity_type: 'financial_entry', entity_id: titulo.id,
    details: { invoice_id: invoiceId, devolvido: devolver, motivo },
  })

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/financial')
  return { ok: true, devolvido: devolver }
}

const CAMPOS_TITULO = 'id, amount, invoice_id, consultation_id, tutor_id, patient_id, company_id, description, notes, status, payment_method'

/** Estorno de título do Financeiro: devolve o crédito se foi crédito; senão, o estorno comum. */
export async function estornarTituloFinanceiro(id: string, motivo = 'estorno de baixa'): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Apenas gerentes podem estornar.' }

  const admin = createAdminClient()
  const { data: e } = await admin.from('financial_entries').select(CAMPOS_TITULO).eq('id', id).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!e) return { error: 'Título não encontrado.' }
  if ((e as { payment_method?: string | null }).payment_method !== 'credit_balance') return reverseFinancialEntry(id)

  const r = await reverterUsoDeCredito(admin, ctx, e as unknown as TituloDeCredito, motivo)
  return 'error' in r ? r : { success: true }
}

/** Estorno de lançamento do Caixa Central: idem, pela porta do caixa. */
export async function estornarLancamentoDoCaixa(entryId: string, motivo: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin', 'owner', 'manager'].includes(ctx.role)) return { error: 'Apenas gerentes podem estornar lançamentos.' }
  if (!motivo.trim()) return { error: 'Justificativa de estorno é obrigatória.' }

  const admin = createAdminClient()
  const { data: cc } = await admin.from('central_cashier')
    .select('id, status, amount, payment_method, source_module, source_id')
    .eq('id', entryId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!cc) return { error: 'Lançamento não encontrado.' }
  const row = cc as { status: string; amount: number; payment_method: string | null; source_module: string; source_id: string | null }
  if (row.payment_method !== 'credit_balance' || !row.source_id) return reverseCashierEntry(entryId, motivo)
  if (row.status === 'reversed') return { error: 'Lançamento já foi estornado anteriormente.' }

  // O lançamento do caixa é o espelho do título "quitado com crédito" da
  // mesma fatura e do mesmo valor — é por ele que o estorno completo roda.
  const { data: titulos } = await admin.from('financial_entries').select(CAMPOS_TITULO)
    .eq('clinic_id', ctx.clinicId).eq('invoice_id', row.source_id)
    .eq('payment_method', 'credit_balance').eq('status', 'paid')
    .order('created_at', { ascending: false })
  const lista = (titulos ?? []) as unknown as TituloDeCredito[]
  const titulo = lista.find(t => Math.abs(Number(t.amount) - Number(row.amount)) < 0.01) ?? lista[0]
  if (!titulo) {
    // Sem título par (dado antigo): ao menos marca o lançamento como estornado.
    return reverseCashierEntry(entryId, motivo)
  }
  const r = await reverterUsoDeCredito(admin, ctx, titulo, motivo.trim())
  return 'error' in r ? r : { success: true }
}
