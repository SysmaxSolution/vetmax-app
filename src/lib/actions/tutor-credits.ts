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
