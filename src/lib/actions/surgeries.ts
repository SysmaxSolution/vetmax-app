'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'
import { createHospitalization } from './hospitalizations'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SurgeryStatus = 'preparo' | 'sala' | 'rpa' | 'done' | 'canceled'

export interface SurgeryChecklist {
  fasting_confirmed?: boolean
  preop_exams_ok?:    boolean
  consent_signed?:    boolean
  consent_doc_id?:    string | null
}

export interface SurgeryCard {
  id:              string
  clinic_id:       string
  patient_id:      string
  procedure_name:  string
  status:          SurgeryStatus
  asa_risk:        string | null
  isolation_required?: boolean
  postop_hospitalization_id: string | null
  patient: {
    id: string; name: string; species: string; breed: string | null; photo_url: string | null
  }
}

export interface SurgeryBoard {
  preparo: SurgeryCard[]
  sala:    SurgeryCard[]
  rpa:     SurgeryCard[]
}

export interface SurgeryDetail extends SurgeryCard {
  consultation_id: string | null
  checklist:       SurgeryChecklist
  surgical_report: string | null
  notes:           string | null
}

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
  return {
    id: s.id, clinic_id: s.clinic_id, patient_id: s.patient_id,
    procedure_name: s.procedure_name, status: s.status as SurgeryStatus,
    asa_risk: s.asa_risk ?? null,
    postop_hospitalization_id: s.postop_hospitalization_id ?? null,
    patient: {
      id: p?.id ?? '', name: p?.name ?? '—', species: p?.species ?? '',
      breed: p?.breed ?? null, photo_url: p?.photo_url ?? null,
    },
  }
}

// ─── Board (Preparo / Sala / RPA) ─────────────────────────────────────────────

export async function getSurgeriesBoard(): Promise<SurgeryBoard | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('surgeries')
    .select('id, clinic_id, patient_id, procedure_name, status, asa_risk, postop_hospitalization_id, patients ( id, name, species, breed, photo_url )')
    .eq('clinic_id', ctx.clinicId)
    .in('status', ['preparo', 'sala', 'rpa'])
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar cirurgias: ' + error.message }

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
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.patient_id)            return { error: 'Pet é obrigatório.' }
  if (!payload.procedure_name?.trim()) return { error: 'Procedimento é obrigatório.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('surgeries')
    .insert({
      clinic_id:       ctx.clinicId,
      patient_id:      payload.patient_id,
      procedure_name:  payload.procedure_name.trim(),
      consultation_id: payload.consultation_id ?? null,
      asa_risk:        payload.asa_risk ?? null,
      status:          'preparo',
      created_by:      ctx.userId,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao criar cirurgia: ' + error.message }
  await logAudit({ action: 'CREATE_SURGERY', entity_type: 'surgeries', entity_id: data.id as string, details: { procedure: payload.procedure_name } })
  revalidatePath('/dashboard/surgery')
  return { id: data.id as string }
}

// ─── Update status (Kanban Preparo→Sala→RPA) ─────────────────────────────────

export async function updateSurgeryStatus(id: string, status: SurgeryStatus): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  // Marca os marcos temporais ao entrar na sala / sair para RPA.
  if (status === 'sala') patch.started_at = new Date().toISOString()
  if (status === 'rpa')  patch.ended_at   = new Date().toISOString()

  const admin = createAdminClient()
  const { error } = await admin.from('surgeries').update(patch).eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
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
    .select('id, clinic_id, patient_id, consultation_id, procedure_name, status, asa_risk, checklist, surgical_report, notes, postop_hospitalization_id, patients ( id, name, species, breed, photo_url )')
    .eq('id', id).eq('clinic_id', ctx.clinicId).single()
  if (error || !s) return { error: 'Cirurgia não encontrada.' }
  return {
    ...toCard(s),
    consultation_id: (s as any).consultation_id ?? null,
    checklist:       ((s as any).checklist ?? {}) as SurgeryChecklist,
    surgical_report: (s as any).surgical_report ?? null,
    notes:           (s as any).notes ?? null,
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
  if (error) return { error: error.message }
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
  if (error) return { error: error.message }
  revalidatePath('/dashboard/surgery')
  return { success: true }
}

// ─── Ficha anestésica — vitais (clinical_vitals com surgery_id) ──────────────

export interface SurgeryVital {
  id: string; recorded_at: string
  temperature: number | null; heart_rate: number | null; resp_rate: number | null
  spo2: number | null; blood_pressure: string | null; notes: string | null
}

export async function listSurgeryVitals(surgeryId: string): Promise<SurgeryVital[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinical_vitals')
    .select('id, recorded_at, temperature, heart_rate, resp_rate, spo2, blood_pressure, notes')
    .eq('clinic_id', ctx.clinicId).eq('surgery_id', surgeryId)
    .order('recorded_at', { ascending: false }).limit(100)
  if (error) return { error: error.message }
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
  if (error) return { error: 'Erro ao registrar sinais vitais: ' + error.message }
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
  if (error) return { error: 'Erro ao encaminhar para internação: ' + error.message }

  await logAudit({ action: 'SURGERY_TO_HOSPITALIZATION', entity_type: 'surgeries', entity_id: surgeryId, details: { hospitalization_id: hospId } })
  revalidatePath('/dashboard/surgery')
  revalidatePath('/dashboard/hospitalization')
  return { hospitalization_id: hospId! }
}
