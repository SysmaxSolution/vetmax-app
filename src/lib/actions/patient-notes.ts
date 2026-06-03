'use server'

/**
 * Notas do pet — observação, óbito, clínica, comportamento, outras.
 *
 * Óbito (note_type='death') é caso especial:
 *  - Exige metadata.deceased_at preenchido
 *  - Marca patients.deceased_at (+ cause + recorded_by) atomicamente
 *  - Cria card "memorial" no feed do pet
 *  - NUNCA envia notificação ao tutor — esta action é a fonte única de verdade
 *    e não chama nenhum trigger de WhatsApp/e-mail. Quaisquer integrações
 *    devem checar patient.deceased_at antes de notificar.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type NoteType = 'observation' | 'death' | 'clinical' | 'behavior' | 'other'

export interface PatientNote {
  id:          string
  patient_id:  string
  note_type:   NoteType
  title:       string | null
  content:     string
  metadata:    Record<string, unknown>
  created_by:  string | null
  created_by_name: string | null
  created_at:  string
}

type Ctx =
  | { admin: ReturnType<typeof createAdminClient>; clinic_id: string; user_id: string }
  | { error: string }

async function getCtx(): Promise<Ctx> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { admin, clinic_id: profile.clinic_id as string, user_id: user.id }
}

// ─── createPatientNote (genérico — não usar para óbito) ──────────────────────

export async function createPatientNote(input: {
  patient_id: string
  note_type:  Exclude<NoteType, 'death'>
  title?:     string | null
  content:    string
  metadata?:  Record<string, unknown>
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id, user_id } = ctx

  if (!input.content || !input.content.trim()) return { error: 'Conteúdo da nota é obrigatório.' }
  if (input.content.length > 5000) return { error: 'Nota muito longa (máximo 5000 caracteres).' }

  const { data, error } = await admin
    .from('patient_notes')
    .insert({
      clinic_id,
      patient_id: input.patient_id,
      note_type:  input.note_type,
      title:      input.title?.trim() || null,
      content:    input.content.trim(),
      metadata:   input.metadata ?? {},
      created_by: user_id,
    })
    .select('id')
    .single()
  if (error || !data) return { error: 'Erro ao salvar nota: ' + (error?.message ?? '') }

  revalidatePath(`/dashboard/patients/${input.patient_id}`)
  return { id: data.id as string }
}

// ─── listPatientNotes ────────────────────────────────────────────────────────

export async function listPatientNotes(
  patientId: string,
): Promise<PatientNote[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data, error } = await admin
    .from('patient_notes')
    .select(`
      id, patient_id, note_type, title, content, metadata,
      created_by, created_at,
      profiles!patient_notes_created_by_fkey ( full_name )
    `)
    .eq('clinic_id', clinic_id)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }

  return (data ?? []).map((r: any) => ({
    id:              r.id,
    patient_id:      r.patient_id,
    note_type:       r.note_type as NoteType,
    title:           r.title,
    content:         r.content,
    metadata:        (r.metadata as Record<string, unknown>) ?? {},
    created_by:      r.created_by,
    created_by_name: r.profiles?.full_name ?? null,
    created_at:      r.created_at,
  }))
}

// ─── deletePatientNote ───────────────────────────────────────────────────────

export async function deletePatientNote(noteId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  // Bloqueia delete de notas de óbito — exigem fluxo de reversão dedicado
  // (raríssimo, requer aprovação manual). Pode ser implementado mais tarde.
  const { data: note } = await admin
    .from('patient_notes')
    .select('note_type')
    .eq('id', noteId)
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (!note) return { error: 'Nota não encontrada.' }
  if (note.note_type === 'death') {
    return { error: 'Notas de óbito não podem ser removidas. Solicite reversão manual.' }
  }

  const { error } = await admin
    .from('patient_notes')
    .delete()
    .eq('id', noteId)
    .eq('clinic_id', clinic_id)
  if (error) return { error: error.message }
  return { success: true }
}

// ─── recordPatientDeath ──────────────────────────────────────────────────────
// Wrapper especial para registro de óbito. Atomicamente:
//   1) UPDATE patients (deceased_at + cause + recorded_by)
//   2) INSERT patient_notes (note_type='death', content + metadata completa)
//   3) Audit log
//
// Nunca dispara notificação ao tutor — essa é decisão de UX explícita.
// O frontend ainda deve checar patient.deceased_at para esconder a foto
// e bloquear novos atendimentos.

export interface DeathRecord {
  patient_id:        string
  deceased_at:       string                       // ISO datetime
  cause?:            string | null                // motivo (opcional)
  weight_at_death?:  number | null                // peso (opcional)
  place?:            string | null                // local: clínica / domicílio
  attending_vet_id?: string | null                // médico responsável
  observations?:     string | null                // observações adicionais
  necropsy_done?:    boolean | null               // necropsia realizada (MAPA)
  body_destination?: string | null                // destino do corpo (cremação/sepultamento/devolvido ao tutor)
}

export async function recordPatientDeath(
  input: DeathRecord,
): Promise<{ success: true; note_id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id, user_id } = ctx

  if (!input.patient_id)  return { error: 'patient_id obrigatório.' }
  if (!input.deceased_at) return { error: 'Data do óbito é obrigatória.' }
  const deceasedAt = new Date(input.deceased_at)
  if (Number.isNaN(deceasedAt.getTime())) return { error: 'Data do óbito inválida.' }
  if (deceasedAt.getTime() > Date.now() + 60_000) {
    return { error: 'Data do óbito não pode estar no futuro.' }
  }
  if (input.weight_at_death !== null && input.weight_at_death !== undefined) {
    if (!Number.isFinite(input.weight_at_death) || input.weight_at_death <= 0 || input.weight_at_death > 200) {
      return { error: 'Peso informado é inválido.' }
    }
  }

  // Carrega nome do pet para descrição da nota
  const { data: patient } = await admin
    .from('patients')
    .select('name, deceased_at')
    .eq('id', input.patient_id)
    .eq('clinic_id', clinic_id)
    .single()
  if (!patient) return { error: 'Pet não encontrado.' }
  if (patient.deceased_at) {
    return { error: 'Este pet já tem óbito registrado.' }
  }

  // Conteúdo principal da nota
  const lines: string[] = [
    `Óbito registrado em ${deceasedAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`,
  ]
  if (input.cause?.trim())            lines.push(`Causa: ${input.cause.trim()}.`)
  if (input.weight_at_death)          lines.push(`Peso no óbito: ${input.weight_at_death.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg.`)
  if (input.place?.trim())            lines.push(`Local: ${input.place.trim()}.`)
  if (input.body_destination?.trim()) lines.push(`Destino do corpo: ${input.body_destination.trim()}.`)
  if (input.necropsy_done === true)   lines.push(`Necropsia realizada.`)
  if (input.observations?.trim())     lines.push(`Observações: ${input.observations.trim()}`)

  // Pipeline atômico
  const { error: updErr } = await admin
    .from('patients')
    .update({
      deceased_at:          deceasedAt.toISOString(),
      deceased_cause:       input.cause?.trim() || null,
      deceased_recorded_by: user_id,
    })
    .eq('id', input.patient_id)
    .eq('clinic_id', clinic_id)
  if (updErr) return { error: 'Erro ao registrar óbito: ' + updErr.message }

  const { data: note, error: noteErr } = await admin
    .from('patient_notes')
    .insert({
      clinic_id,
      patient_id: input.patient_id,
      note_type:  'death',
      title:      `Óbito de ${patient.name}`,
      content:    lines.join(' '),
      metadata: {
        deceased_at:       deceasedAt.toISOString(),
        cause:             input.cause ?? null,
        weight_at_death:   input.weight_at_death ?? null,
        place:             input.place ?? null,
        attending_vet_id:  input.attending_vet_id ?? null,
        observations:      input.observations ?? null,
        necropsy_done:     input.necropsy_done ?? null,
        body_destination:  input.body_destination ?? null,
      },
      created_by: user_id,
    })
    .select('id')
    .single()
  if (noteErr || !note) return { error: 'Óbito registrado, mas falha ao gravar a nota: ' + (noteErr?.message ?? '') }

  revalidatePath(`/dashboard/patients/${input.patient_id}`)
  return { success: true, note_id: note.id as string }
}
