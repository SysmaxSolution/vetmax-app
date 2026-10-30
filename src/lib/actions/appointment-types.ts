'use server'

// Tipos de atendimento da agenda (0527): "Consulta 30 min", "Ultrassom
// abdominal 40 min no aparelho X", "Tomografia com anestesia 90 min, exige
// profissional". O tipo preenche duração e recurso na marcação; a recepção
// pode trocar. Sem tipo cadastrado, a agenda funciona como sempre.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from '@/lib/errors'
import type { AppointmentType, AppointmentTypeInput } from '@/types/appointment-types'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' as const }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' as const }
  return { clinicId: profile.clinic_id as string, role: (profile.role as string) ?? '' }
}

const GESTAO = ['admin', 'owner', 'manager']

export async function listAppointmentTypes(incluirInativos = false): Promise<AppointmentType[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  let q = admin.from('appointment_types')
    .select('id, clinic_id, name, sector, duration_minutes, color, requires_professional, default_room_id, service_item_id, is_active, room:rooms!default_room_id ( name )')
    .eq('clinic_id', ctx.clinicId)
    .order('sector', { ascending: true, nullsFirst: false })
    .order('name')
  if (!incluirInativos) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) return { error: 'Erro ao listar tipos de atendimento: ' + mensagemErro(error, 'lib/actions/appointment-types.ts') }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(r => {
    const room = Array.isArray(r.room) ? r.room[0] : r.room
    return {
      id: r.id as string, clinic_id: r.clinic_id as string, name: r.name as string,
      sector: (r.sector as string | null) ?? null,
      duration_minutes: Number(r.duration_minutes ?? 30),
      color: (r.color as string | null) ?? null,
      requires_professional: r.requires_professional === true,
      default_room_id: (r.default_room_id as string | null) ?? null,
      default_room_name: ((room as { name?: string } | null)?.name) ?? null,
      service_item_id: (r.service_item_id as string | null) ?? null,
      is_active: r.is_active !== false,
    }
  })
}

export async function upsertAppointmentType(input: AppointmentTypeInput): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!GESTAO.includes(ctx.role)) return { error: 'Só a gestão cadastra tipos de atendimento.' }
  const name = input.name.trim()
  if (name.length < 2) return { error: 'Informe o nome do tipo de atendimento.' }
  const dur = Math.round(Number(input.duration_minutes))
  if (!(dur >= 5 && dur <= 1440)) return { error: 'Duração deve ficar entre 5 minutos e 24 horas.' }
  const admin = createAdminClient()
  const payload = {
    clinic_id: ctx.clinicId, name, sector: input.sector?.trim() || null, duration_minutes: dur,
    color: input.color?.trim() || null, requires_professional: input.requires_professional === true,
    default_room_id: input.default_room_id || null, service_item_id: input.service_item_id || null,
    is_active: input.is_active !== false, updated_at: new Date().toISOString(),
  }
  const { data, error } = input.id
    ? await admin.from('appointment_types').update(payload).eq('id', input.id).eq('clinic_id', ctx.clinicId).select('id').single()
    : await admin.from('appointment_types').insert(payload).select('id').single()
  if (error) {
    if (error.code === '23505') return { error: `Já existe um tipo chamado "${name}".` }
    return { error: 'Erro ao salvar: ' + mensagemErro(error, 'lib/actions/appointment-types.ts') }
  }
  revalidatePath('/dashboard/appointments'); revalidatePath('/dashboard/management')
  return { id: (data as { id: string }).id }
}

export async function deleteAppointmentType(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!GESTAO.includes(ctx.role)) return { error: 'Só a gestão altera tipos de atendimento.' }
  const admin = createAdminClient()
  // Desativa em vez de apagar: marcações antigas continuam apontando para o tipo.
  const { error } = await admin.from('appointment_types').update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Erro ao desativar: ' + mensagemErro(error, 'lib/actions/appointment-types.ts') }
  revalidatePath('/dashboard/appointments'); revalidatePath('/dashboard/management')
  return { ok: true }
}
