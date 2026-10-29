'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { avaliarGate, lerConfigGate, ROTULO_EXIGENCIA } from '@/lib/surgery/gate-preanestesico'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'
import { createHospitalization } from './hospitalizations'

import { mensagemErro } from '@/lib/errors'
import type { SurgeryStatus, SurgeryChecklist, SurgeryCard, SurgeryBoard, SurgeryDetail, SurgeryVital } from '@/types/surgeries'
// ─── Tipos ───────────────────────────────────────────────────────────────────

async function getCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

function toCard(s: Record<string, any>): SurgeryCard {
  const p = s.patients as any
  const t = p?.tutors as any
  return {
    id: s.id, clinic_id: s.clinic_id, patient_id: s.patient_id,
    procedure_name: s.procedure_name, status: s.status as SurgeryStatus,
    asa_risk: s.asa_risk ?? null,
    postop_hospitalization_id: s.postop_hospitalization_id ?? null,
    patient: {
      id: p?.id ?? '', name: p?.name ?? '—', species: p?.species ?? '',
      breed: p?.breed ?? null, photo_url: p?.photo_url ?? null,
    },
    tutor: t?.name ? { name: t.name as string } : null,
  }
}

// ─── Board (Preparo / Sala / RPA) ─────────────────────────────────────────────

export async function getSurgeriesBoard(): Promise<SurgeryBoard | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('surgeries')
    .select('id, clinic_id, patient_id, procedure_name, status, asa_risk, postop_hospitalization_id, patients ( id, name, species, breed, photo_url, tutors ( name ) )')
    .eq('clinic_id', ctx.clinicId)
    .in('status', ['preparo', 'sala', 'rpa'])
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar cirurgias: ' + mensagemErro(error, 'lib/actions/surgeries.ts') }

  const board: SurgeryBoard = { preparo: [], sala: [], rpa: [] }
  for (const s of data ?? []) {
    const card = toCard(s)
    if (card.status in board) board[card.status as keyof SurgeryBoard].push(card)
  }
  return board
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createSurgery(payload: {
  patient_id:      string
  procedure_name:  string
  consultation_id?: string | null
  asa_risk?:       string | null
  /** Serviço do catálogo que originou a cirurgia — traz checklist e kit padrão (0518). */
  service_id?:     string | null
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.patient_id)            return { error: 'Pet é obrigatório.' }
  if (!payload.procedure_name?.trim()) return { error: 'Procedimento é obrigatório.' }

  const admin = createAdminClient()
  // O serviço vem do navegador: tem de ser desta clínica e ser serviço.
  let serviceId: string | null = null
  if (payload.service_id) {
    const { data: svc } = await admin.from('stock_items').select('id')
      .eq('id', payload.service_id).eq('clinic_id', ctx.clinicId).eq('is_service', true).maybeSingle()
    serviceId = (svc?.id as string | undefined) ?? null
  }
  const { data, error } = await admin
    .from('surgeries')
    .insert({
      clinic_id:       ctx.clinicId,
      patient_id:      payload.patient_id,
      procedure_name:  payload.procedure_name.trim(),
      consultation_id: payload.consultation_id ?? null,
      asa_risk:        payload.asa_risk ?? null,
      service_id:      serviceId,
      status:          'preparo',
      created_by:      ctx.userId,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao criar cirurgia: ' + mensagemErro(error, 'lib/actions/surgeries.ts') }
  await logAudit({ action: 'CREATE_SURGERY', entity_type: 'surgeries', entity_id: data.id as string, details: { procedure: payload.procedure_name } })
  revalidatePath('/dashboard/surgery')
  return { id: data.id as string }
}

// ─── Update status (Kanban Preparo→Sala→RPA) ─────────────────────────────────

export async function updateSurgeryStatus(id: string, status: SurgeryStatus): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin0 = createAdminClient()

  // ─── Gate do pre-anestesico (Fase 4 · item 4.2) ───────────────────────────
  //
  // So a ENTRADA EM SALA passa pelo gate. Voltar para preparo, ir para RPA ou
  // encerrar nunca sao barrados: prender um animal anestesiado numa regra de
  // software seria pior do que o problema que o gate resolve.
  //
  // O padrao da clinica e "nada trava" — ligar a trava e ato de configuracao
  // (clinics.flow_config.gate_pre_anestesico). Com a trava ligada e exigencia em
  // falta, e preciso liberar com motivo (surgery_gate_overrides), e a liberacao
  // ja registrada vale para esta transicao.
  if (status === 'sala') {
    const { data: atual } = await admin0
      .from('surgeries')
      .select('checklist, asa_risk')
      .eq('id', id).eq('clinic_id', ctx.clinicId)
      .maybeSingle()

    const { data: clinic } = await admin0
      .from('clinics').select('flow_config').eq('id', ctx.clinicId).single()
    const config = lerConfigGate((clinic?.flow_config ?? {}) as Record<string, unknown>)

    const avaliacao = avaliarGate({
      checklist: (atual?.checklist ?? {}) as Record<string, boolean | null | undefined>,
      asaRisk:   (atual?.asa_risk as string | null) ?? null,
      config,
    })

    if (!avaliacao.liberado) {
      const { data: liberacao } = await admin0
        .from('surgery_gate_overrides')
        .select('id')
        .eq('clinic_id', ctx.clinicId)
        .eq('surgery_id', id)
        .eq('target_status', 'sala')
        .limit(1)
        .maybeSingle()

      if (!liberacao) {
        const faltam = avaliacao.bloqueios.map(b => ROTULO_EXIGENCIA[b]).join(', ')
        return { error: `Pre-anestesico incompleto: ${faltam}. Libere com motivo para seguir para a sala.` }
      }
    }
  }

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  // Marca os marcos temporais ao entrar na sala / sair para RPA.
  if (status === 'sala') patch.started_at = new Date().toISOString()
  if (status === 'rpa')  patch.ended_at   = new Date().toISOString()

  const { error } = await admin0.from('surgeries').update(patch).eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: mensagemErro(error, 'lib/actions/surgeries.ts') }
  revalidatePath('/dashboard/surgery')
  return { success: true }
}

// ─── Get (detalhe completo p/ a ficha) ───────────────────────────────────────

export async function getSurgery(id: string): Promise<SurgeryDetail | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data: s, error } = await admin
    .from('surgeries')
    .select('id, clinic_id, patient_id, consultation_id, procedure_name, status, asa_risk, checklist, surgical_report, notes, postop_hospitalization_id, service_id, service:stock_items!service_id ( name, preop_checklist, default_kit_id ), patients ( id, name, species, breed, photo_url, tutors ( name ) )')
    .eq('id', id).eq('clinic_id', ctx.clinicId).single()
  if (error || !s) return { error: 'Cirurgia não encontrada.' }
  const svcRaw = (s as any).service
  const svc = (Array.isArray(svcRaw) ? svcRaw[0] : svcRaw) as { name?: string; preop_checklist?: unknown; default_kit_id?: string | null } | null
  return {
    ...toCard(s),
    consultation_id: (s as any).consultation_id ?? null,
    checklist:       ((s as any).checklist ?? {}) as SurgeryChecklist,
    surgical_report: (s as any).surgical_report ?? null,
    notes:           (s as any).notes ?? null,
    service_id:      (s as any).service_id ?? null,
    service_preop_checklist: Array.isArray(svc?.preop_checklist) ? (svc!.preop_checklist as unknown[]).map(x => String(x)) : [],
    service_default_kit_id:  svc?.default_kit_id ?? null,
  }
}

// ─── Update checklist / relatório ────────────────────────────────────────────

export async function updateSurgeryChecklist(id: string, checklist: SurgeryChecklist): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin.from('surgeries')
    .update({ checklist, updated_at: new Date().toISOString() })
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: mensagemErro(error, 'lib/actions/surgeries.ts') }
  revalidatePath('/dashboard/surgery')
  return { success: true }
}

export async function updateSurgeryReport(id: string, report: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin.from('surgeries')
    .update({ surgical_report: report, updated_at: new Date().toISOString() })
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: mensagemErro(error, 'lib/actions/surgeries.ts') }
  revalidatePath('/dashboard/surgery')
  return { success: true }
}

// ─── Ficha anestésica — vitais (clinical_vitals com surgery_id) ──────────────

export async function listSurgeryVitals(surgeryId: string): Promise<SurgeryVital[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinical_vitals')
    .select('id, recorded_at, temperature, heart_rate, resp_rate, spo2, blood_pressure, notes')
    .eq('clinic_id', ctx.clinicId).eq('surgery_id', surgeryId)
    .order('recorded_at', { ascending: false }).limit(100)
  if (error) return { error: mensagemErro(error, 'lib/actions/surgeries.ts') }
  return (data ?? []).map((r): SurgeryVital => ({
    id: r.id as string, recorded_at: r.recorded_at as string,
    temperature: r.temperature === null ? null : Number(r.temperature),
    heart_rate:  r.heart_rate  === null ? null : Number(r.heart_rate),
    resp_rate:   r.resp_rate   === null ? null : Number(r.resp_rate),
    spo2:        r.spo2        === null ? null : Number(r.spo2),
    blood_pressure: (r.blood_pressure as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }))
}

export async function recordSurgeryVital(surgeryId: string, payload: {
  temperature?: number | null; heart_rate?: number | null; resp_rate?: number | null
  spo2?: number | null; blood_pressure?: string | null; notes?: string | null
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const N = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : Number(v))
  const hasAny = [payload.temperature, payload.heart_rate, payload.resp_rate, payload.spo2, payload.blood_pressure].some(v => v !== null && v !== undefined && `${v}`.trim() !== '')
  if (!hasAny) return { error: 'Informe ao menos um parâmetro.' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('clinical_vitals').insert({
    clinic_id: ctx.clinicId, surgery_id: surgeryId, recorded_by: ctx.userId,
    temperature: N(payload.temperature), heart_rate: N(payload.heart_rate), resp_rate: N(payload.resp_rate),
    spo2: N(payload.spo2), blood_pressure: payload.blood_pressure?.trim() || null,
    notes: payload.notes?.trim() || null, source: 'manual',
  }).select('id').single()
  if (error) return { error: 'Erro ao registrar sinais vitais: ' + mensagemErro(error, 'lib/actions/surgeries.ts') }
  return { id: data.id as string }
}

// ─── Transição Pós-Op (Encaminhar para Internação) ──────────────────────────

/**
 * Encerra a cirurgia e encaminha o paciente para a Internação: cria (ou reusa)
 * a hospitalization, vincula em postop_hospitalization_id, transfere a fatura da
 * cirurgia (surgery_charges open) para a Conta da Internação e tira a cirurgia
 * do Kanban (status 'done').
 */
export async function sendSurgeryToInternacao(
  surgeryId: string,
  opts: { status?: 'observation' | 'icu'; reason?: string } = {},
): Promise<{ hospitalization_id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: surgery } = await admin
    .from('surgeries')
    .select('id, patient_id, consultation_id, procedure_name, postop_hospitalization_id')
    .eq('id', surgeryId).eq('clinic_id', ctx.clinicId).single()
  if (!surgery) return { error: 'Cirurgia não encontrada.' }

  let hospId = (surgery.postop_hospitalization_id as string | null) ?? null
  if (!hospId) {
    const res = await createHospitalization({
      patient_id:      surgery.patient_id as string,
      consultation_id: (surgery.consultation_id as string | null) ?? undefined,
      status:          opts.status ?? 'observation',
      reason:          opts.reason?.trim() || `Pós-operatório: ${surgery.procedure_name}`,
    })
    if ('error' in res) return { error: res.error }
    hospId = res.id
  }

  // Transfere a fatura da cirurgia para a Conta da Internação (Regra 4).
  const { data: charges } = await admin
    .from('surgery_charges')
    .select('kind, description, quantity, unit_amount, amount')
    .eq('surgery_id', surgeryId).eq('clinic_id', ctx.clinicId).eq('status', 'open')

  if (charges && charges.length > 0) {
    const rows = charges.map(c => ({
      clinic_id: ctx.clinicId, hospitalization_id: hospId,
      kind: (c.kind === 'medication' ? 'medication' : c.kind === 'procedure' ? 'procedure' : 'kit') as string,
      description: `[Cirurgia] ${c.description}`,
      quantity: Number(c.quantity ?? 1), unit_amount: Number(c.unit_amount ?? 0), amount: Number(c.amount ?? 0),
      status: 'open', created_by: ctx.userId,
    }))
    await admin.from('hospitalization_charges').insert(rows)
    await admin.from('surgery_charges').update({ status: 'transferred' })
      .eq('surgery_id', surgeryId).eq('clinic_id', ctx.clinicId).eq('status', 'open')
  }

  const { error } = await admin.from('surgeries')
    .update({ status: 'done', postop_hospitalization_id: hospId, ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', surgeryId).eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Erro ao encaminhar para internação: ' + mensagemErro(error, 'lib/actions/surgeries.ts') }

  await logAudit({ action: 'SURGERY_TO_HOSPITALIZATION', entity_type: 'surgeries', entity_id: surgeryId, details: { hospitalization_id: hospId } })
  revalidatePath('/dashboard/surgery')
  revalidatePath('/dashboard/hospitalization')
  return { hospitalization_id: hospId! }
}
