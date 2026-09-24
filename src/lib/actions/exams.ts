'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendToCashier } from '@/lib/actions/vet'
import { computeLabCost } from '@/lib/labs/commission'
import { EXAM_QUEUE_STATUSES, examQueueMoveError } from '@/lib/exams/queue-status'
import { usesExamRejectionFlow } from '@/lib/exams/rejection-gate'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExamQueueItem = {
  id:           string
  status:       string
  visit_reason: string
  created_at:   string
  exam_types:   string[]
  lab_partner_name:     string | null
  lab_return_deadline:  string | null
  patient: {
    id:            string
    name:          string
    species:       string
    breed:         string | null
    photo_url:     string | null
    behavior_tags: string[]
  }
  tutor: {
    name:  string
    phone: string
  }
}

// ─── Fila de Exames (waiting_exam) ───────────────────────────────────────────

export async function getExamsQueue(): Promise<ExamQueueItem[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('consultations')
    .select(`
      id, status, visit_reason, created_at, lab_partner_clinic_id, lab_return_deadline,
      exam_requests ( exam_type ),
      patients ( id, name, species, breed, photo_url, behavior_tags,
        tutors ( name, phone )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', ['waiting_exam', 'awaiting_lab_result'])
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar fila de exames: ' + error.message }

  // nomes dos laboratórios (lab_partner_clinic_id não tem FK → busca separada)
  const labIds = [...new Set((data ?? []).map((c: any) => c.lab_partner_clinic_id).filter(Boolean))] as string[]
  const labNames = new Map<string, string>()
  if (labIds.length) {
    const admin = createAdminClient()
    const { data: labs } = await admin.from('partner_clinics').select('id, name').in('id', labIds)
    for (const l of labs ?? []) labNames.set(l.id as string, l.name as string)
  }

  return (data ?? []).map((c: any) => ({
    id:           c.id,
    status:       c.status,
    visit_reason: c.visit_reason,
    created_at:   c.created_at,
    exam_types:   Array.isArray(c.exam_requests) ? c.exam_requests.map((r: any) => r.exam_type).filter(Boolean) : [],
    lab_partner_name:    c.lab_partner_clinic_id ? (labNames.get(c.lab_partner_clinic_id) ?? null) : null,
    lab_return_deadline: c.lab_return_deadline ?? null,
    patient: {
      id:            c.patients?.id      ?? '',
      name:          c.patients?.name      ?? '—',
      species:       c.patients?.species   ?? '',
      breed:         c.patients?.breed     ?? null,
      photo_url:     c.patients?.photo_url ?? null,
      behavior_tags: Array.isArray(c.patients?.behavior_tags) ? c.patients.behavior_tags : [],
    },
    tutor: {
      name:  c.patients?.tutors?.name  ?? '—',
      phone: c.patients?.tutors?.phone ?? '',
    },
  })) as ExamQueueItem[]
}

// ─── Histórico de Exames do Dia ───────────────────────────────────────────────

export type ExamHistoryItem = {
  id:           string
  status:       string
  visit_reason: string
  created_at:   string
  exam_notes:   string | null
  patient: {
    id:        string
    name:      string
    species:   string
    breed:     string | null
    photo_url: string | null
  }
  tutor: {
    name:  string
    phone: string
  }
}

export async function getExamsHistory(): Promise<ExamHistoryItem[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Consultas de hoje com exam_notes preenchidas = o técnico registrou o laudo
  const { data, error } = await supabase
    .from('consultations')
    .select(`
      id, status, visit_reason, created_at, exam_notes,
      patients ( id, name, species, breed, photo_url,
        tutors ( name, phone )
      )
    `)
    .eq('clinic_id', profile.clinic_id)
    .not('exam_notes', 'is', null)
    .gte('updated_at', todayStart.toISOString())
    .order('updated_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar histórico de exames: ' + error.message }

  return (data ?? []).map((c: any) => ({
    id:           c.id,
    status:       c.status,
    visit_reason: c.visit_reason,
    created_at:   c.created_at,
    exam_notes:   c.exam_notes,
    patient: {
      id:        c.patients?.id        ?? '',
      name:      c.patients?.name      ?? '—',
      species:   c.patients?.species   ?? '',
      breed:     c.patients?.breed     ?? null,
      photo_url: c.patients?.photo_url ?? null,
    },
    tutor: {
      name:  c.patients?.tutors?.name  ?? '—',
      phone: c.patients?.tutors?.phone ?? '',
    },
  })) as ExamHistoryItem[]
}

// ─── Devolver ao Médico (waiting_exam → in_progress) ─────────────────────────

export async function dischargeFromExams(
  consultationId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  // Aceita os DOIS estados da fila de exames. Antes só 'waiting_exam': quando o
  // exame tinha ido a laboratório parceiro ('awaiting_lab_result') o UPDATE
  // casava zero linhas, o Supabase não devolvia erro e a action reportava
  // sucesso sem fazer nada.
  const { data: moved, error } = await supabase
    .from('consultations')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .in('status', EXAM_QUEUE_STATUSES as unknown as string[])
    .select('id')

  if (error) return { error: 'Erro ao dar alta: ' + error.message }
  if (!moved?.length) {
    const { data: cur } = await supabase
      .from('consultations').select('status')
      .eq('id', consultationId).eq('clinic_id', profile.clinic_id).maybeSingle()
    return { error: examQueueMoveError((cur as { status?: string } | null)?.status) }
  }

  revalidatePath('/dashboard/exams')
  revalidatePath('/dashboard/reception')
  return { success: true }
}

export async function returnToVet(
  consultationId: string,
  examNotes?: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const payload: Record<string, any> = {
    status:     'in_progress',
    updated_at: new Date().toISOString(),
  }
  if (examNotes?.trim()) payload.exam_notes = examNotes.trim()

  // Mesmo bug de dischargeFromExams: 'awaiting_lab_result' também é fila de exames.
  const { data: moved, error } = await supabase
    .from('consultations')
    .update(payload)
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .in('status', EXAM_QUEUE_STATUSES as unknown as string[])
    .select('id')

  if (error) return { error: 'Erro ao devolver consulta: ' + error.message }
  if (!moved?.length) {
    const { data: cur } = await supabase
      .from('consultations').select('status')
      .eq('id', consultationId).eq('clinic_id', profile.clinic_id).maybeSingle()
    return { error: examQueueMoveError((cur as { status?: string } | null)?.status) }
  }

  revalidatePath('/dashboard/exams')
  revalidatePath('/dashboard/vet')
  return { success: true }
}

// ─── exam_requests table (E2E tests use this table) ──────────────────────────

export type ExamRequest = {
  id:         string
  exam_type:  string
  status:     string
  result:     string | null
  created_at: string
  patient: {
    id:        string
    name:      string
    species:   string
    breed:     string | null
    photo_url: string | null
  }
  tutor: {
    name:  string
    phone: string
  }
}

export async function getExamRequests(): Promise<ExamRequest[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()
    if (!profile?.clinic_id) return []

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('exam_requests')
      .select(`
        id, exam_type, status, result, created_at,
        patients ( id, name, species, breed, photo_url,
          tutors ( name, phone )
        )
      `)
      .eq('clinic_id', profile.clinic_id)
      .in('status', ['pending', 'in_progress'])
      .is('consultation_id', null)
      .order('created_at', { ascending: true })

    if (error || !data) return []

    return data.map((r: any) => ({
      id:         r.id,
      exam_type:  r.exam_type ?? 'exam',
      status:     r.status,
      result:     r.result ?? null,
      created_at: r.created_at,
      patient: {
        id:        r.patients?.id        ?? '',
        name:      r.patients?.name      ?? '—',
        species:   r.patients?.species   ?? '',
        breed:     r.patients?.breed     ?? null,
        photo_url: r.patients?.photo_url ?? null,
      },
      tutor: {
        name:  r.patients?.tutors?.name  ?? '—',
        phone: r.patients?.tutors?.phone ?? '',
      },
    }))
  } catch {
    return []
  }
}

export async function requestExam(params: {
  patient_id: string
  tutor_id:   string
  exam_type:  string
  notes?:     string
  /**
   * Quando vier (caller é o Consultório solicitando exame dentro de um atendimento
   * em andamento), NÃO cria consulta nova — apenas transiciona a existente para
   * 'waiting_exam' e vincula o exam_request a ela. Isso preserva o histórico do
   * MV solicitante e permite o "Devolver ao MV" depois.
   *
   * Quando NÃO vier (caller é o módulo Exames montando solicitação avulsa),
   * cria uma consulta nova com visit_reason='exam' como antes.
   */
  consultation_id?: string
}): Promise<{ id: string; consultation_id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  let consultationId: string

  if (params.consultation_id) {
    // Caminho do Consultório: transiciona a consulta atual para waiting_exam.
    const { data: existing, error: existErr } = await admin
      .from('consultations')
      .select('id, clinic_id, status')
      .eq('id', params.consultation_id)
      .eq('clinic_id', profile.clinic_id)
      .single()
    if (existErr || !existing) return { error: 'Consulta de origem não encontrada.' }

    // Só transiciona se ainda estiver em status ativo do MV; não pisotear cancelled/completed.
    if (['in_progress','scheduled','reception','triage','medication'].includes(existing.status)) {
      const { error: upErr } = await admin
        .from('consultations')
        .update({ status: 'waiting_exam' })
        .eq('id', existing.id)
      if (upErr) return { error: 'Erro ao transicionar consulta: ' + upErr.message }
    }
    consultationId = existing.id
  } else {
    // Caminho do módulo Exames: solicitação avulsa cria consulta nova.
    const { data: consultation, error: consultErr } = await admin
      .from('consultations')
      .insert({
        clinic_id:      profile.clinic_id,
        patient_id:     params.patient_id,
        visit_reason:   'exam',
        status:         'waiting_exam',
        payment_status: 'pending',
      })
      .select('id')
      .single()

    if (consultErr || !consultation) {
      return { error: 'Erro ao criar consulta de exame: ' + (consultErr?.message ?? '') }
    }
    consultationId = consultation.id
  }

  const { data, error } = await admin
    .from('exam_requests')
    .insert({
      clinic_id:       profile.clinic_id,
      patient_id:      params.patient_id,
      tutor_id:        params.tutor_id,
      exam_type:       params.exam_type,
      consultation_id: consultationId,
      notes:           params.notes ?? 'Exame solicitado manualmente no módulo de Exames.',
      status:          'pending',
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao solicitar exame: ' + error.message }
  revalidatePath('/dashboard/exams')
  revalidatePath('/dashboard/vet')
  revalidatePath('/dashboard/reception')
  return { id: data.id, consultation_id: consultationId }
}

export async function saveExamResult(
  examRequestId: string,
  result: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('exam_requests')
    .update({ status: 'completed', result, updated_at: new Date().toISOString() })
    .eq('id', examRequestId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao salvar resultado: ' + error.message }
  revalidatePath('/dashboard/exams')
  return { success: true }
}

// ─── 1.11 F2 · Enviar exame ao laboratório parceiro ───────────────────────────
// Cobra o tutor (envia ao caixa), marca a consulta como "aguardando resultado do
// laboratório" com o lab + prazo, e gera o título a PAGAR ao laboratório (custo
// por serviço via comissão da parceira — F1).
export async function sendExamToPartnerLab(input: {
  consultation_id:   string
  partner_clinic_id: string
  return_deadline?:  string | null
}): Promise<{ ok: true; lab_cost: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const clinicId = profile.clinic_id as string
  const admin = createAdminClient()

  const { data: lab } = await admin.from('partner_clinics')
    .select('id, name').eq('id', input.partner_clinic_id).eq('clinic_id', clinicId).maybeSingle()
  if (!lab) return { error: 'Laboratório parceiro não encontrado.' }

  // 1) cobrança. Comportamento padrão (e de todas as clínicas sem a flag):
  //    cobra o tutor na hora, enviando ao caixa — mesmo fluxo do consultório.
  //    Com o Fluxo de Rejeição de Exame LIGADO a cobrança é ADIADA: o exame
  //    enviado ao laboratório ainda pode voltar não realizado (amostra
  //    lipêmica etc.) e, nesse caso, não pode ser cobrado. As linhas de exame
  //    ganham a trava e o título nasce só quando o resultado for liberado.
  const rejectionFlowOn = await usesExamRejectionFlow(admin, clinicId)
  if (rejectionFlowOn) {
    const holdAt = new Date().toISOString()
    const { data: examLines } = await admin
      .from('consultation_services')
      .select('id, stock_items ( category )')
      .eq('clinic_id', clinicId)
      .eq('consultation_id', input.consultation_id)
      .is('cancelled_at', null)
      .is('billed_in_invoice_id', null)
      .is('exam_billing_hold_at', null)
    const ids = (examLines ?? []).filter(l => {
      const si = (l as { stock_items?: { category?: string } | Array<{ category?: string }> }).stock_items
      const cat = Array.isArray(si) ? si[0]?.category : si?.category
      return cat === 'exam'
    }).map(l => l.id as string)
    if (ids.length > 0) {
      await admin.from('consultation_services')
        .update({ exam_state: 'pending', exam_billing_hold_at: holdAt, exam_return_deadline: input.return_deadline ?? null, updated_at: holdAt })
        .in('id', ids).eq('clinic_id', clinicId)
    }
  } else {
    const cash = await sendToCashier(input.consultation_id)
    if ('error' in cash) return { error: cash.error }
  }

  // 2) marca a consulta: aguardando resultado do lab + lab + prazo
  await admin.from('consultations').update({
    status: 'awaiting_lab_result',
    lab_partner_clinic_id: input.partner_clinic_id,
    lab_return_deadline: input.return_deadline ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', input.consultation_id).eq('clinic_id', clinicId)

  // 3) título a PAGAR ao laboratório: custo por serviço (comissão da parceira)
  const [{ data: services }, { data: rules }, { data: cons }] = await Promise.all([
    admin.from('consultation_services').select('stock_item_id, price_snapshot, quantity').eq('consultation_id', input.consultation_id).is('cancelled_at', null),
    admin.from('partner_clinic_commissions').select('item_id, item_type, commission_type, value').eq('clinic_id', clinicId).eq('partner_clinic_id', input.partner_clinic_id).eq('is_active', true),
    admin.from('consultations').select('patient_id, patients(name)').eq('id', input.consultation_id).maybeSingle(),
  ])
  const labCost = computeLabCost(
    (services ?? []) as any[],
    (rules ?? []) as any[],
  )

  if (labCost > 0) {
    const pats = (cons as { patients?: { name?: string } | { name?: string }[] } | null)?.patients
    const petName = Array.isArray(pats) ? pats[0]?.name : pats?.name
    await admin.from('financial_entries').insert({
      clinic_id: clinicId, type: 'payable', consultation_id: input.consultation_id,
      description: `Exame — ${lab.name}${petName ? ` · ${petName}` : ''}`,
      beneficiary: lab.name, amount: labCost,
      due_date: input.return_deadline ?? new Date().toISOString().slice(0, 10),
      issue_date: new Date().toISOString().slice(0, 10),
      status: 'pending', source: 'manual', category: 'Laboratório', created_by: user.id,
    })
  }

  revalidatePath('/dashboard/exams')
  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/financial')
  return { ok: true, lab_cost: labCost }
}

// ─── Etiqueta do tubo + leitura da amostra bipada (Fase 2) ────────────────────

async function labCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { admin: createAdminClient(), clinic_id: profile.clinic_id as string }
}

export interface SampleInfo {
  consultation_id: string
  sample_code:     string          // nº da OS
  patient_name:    string
  species:         string | null
  tutor_name:      string | null
  status:          string
  exams:           string[]        // serviços/exames vinculados à amostra
  collected_at:    string | null
}

async function loadSample(admin: ReturnType<typeof createAdminClient>, clinicId: string, consultationId: string): Promise<SampleInfo | null> {
  const { data: c } = await admin
    .from('consultations')
    .select('id, os_number, status, created_at, patient_id, tutor_id, patients(name, species), tutors(name)')
    .eq('id', consultationId).eq('clinic_id', clinicId).maybeSingle()
  if (!c) return null
  const pat = Array.isArray((c as any).patients) ? (c as any).patients[0] : (c as any).patients
  const tut = Array.isArray((c as any).tutors) ? (c as any).tutors[0] : (c as any).tutors
  const { data: svcs } = await admin
    .from('consultation_services')
    .select('name_snapshot')
    .eq('clinic_id', clinicId).eq('consultation_id', consultationId).is('cancelled_at', null)
  return {
    consultation_id: c.id as string,
    sample_code: (c.os_number as string | null) ?? (c.id as string).slice(0, 8),
    patient_name: pat?.name ?? 'Pet',
    species: pat?.species ?? null,
    tutor_name: tut?.name ?? null,
    status: c.status as string,
    exams: (svcs ?? []).map((s: any) => s.name_snapshot).filter(Boolean),
    collected_at: (c.created_at as string) ?? null,
  }
}

/** Dados para imprimir a etiqueta do tubo de uma consulta/OS. */
export async function getExamLabelData(consultationId: string): Promise<SampleInfo | { error: string }> {
  const ctx = await labCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const s = await loadSample(ctx.admin, ctx.clinic_id, consultationId)
  return s ?? { error: 'Atendimento não encontrado.' }
}

/** Bipar a etiqueta: recebe o código (nº da OS) e devolve os exames da amostra. */
export async function getExamsBySample(code: string): Promise<SampleInfo | { error: string }> {
  const ctx = await labCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const clean = (code ?? '').trim()
  if (!clean) return { error: 'Código da amostra vazio.' }
  const { data: c } = await ctx.admin
    .from('consultations')
    .select('id')
    .eq('clinic_id', ctx.clinic_id).eq('os_number', clean)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!c) return { error: `Amostra "${clean}" não encontrada.` }
  const s = await loadSample(ctx.admin, ctx.clinic_id, c.id as string)
  return s ?? { error: 'Amostra não encontrada.' }
}
