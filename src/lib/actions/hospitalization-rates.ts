'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type CareLevel = 'enfermaria' | 'semi_intensiva' | 'uti' | 'isolamento'
export type AnimalSize = 'small' | 'medium' | 'large'

export interface DailyRate {
  id:         string
  category:   CareLevel
  species:    string | null
  size:       AnimalSize | null
  rate:       number
  active:     boolean
  created_at: string
}

export interface CreateDailyRatePayload {
  category: CareLevel
  species?: string | null
  size?:    AnimalSize | null
  rate:     number
}

async function getCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

const VALID_CATEGORIES: CareLevel[] = ['enfermaria', 'semi_intensiva', 'uti', 'isolamento']
const VALID_SIZES: AnimalSize[] = ['small', 'medium', 'large']

function mapRow(r: Record<string, any>): DailyRate {
  return {
    id:         r.id as string,
    category:   r.category as CareLevel,
    species:    (r.species as string | null) ?? null,
    size:       (r.size as AnimalSize | null) ?? null,
    rate:       Number(r.rate ?? 0),
    active:     !!r.active,
    created_at: r.created_at as string,
  }
}

// ─── Listar / criar / atualizar / desativar ─────────────────────────────────

export async function listDailyRates(): Promise<DailyRate[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hospitalization_daily_rates')
    .select('id, category, species, size, rate, active, created_at')
    .eq('clinic_id', ctx.clinicId)
    .order('category', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) return { error: error.message }
  return (data ?? []).map(mapRow)
}

export async function createDailyRate(payload: CreateDailyRatePayload): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!VALID_CATEGORIES.includes(payload.category)) return { error: 'Categoria inválida.' }
  if (payload.size && !VALID_SIZES.includes(payload.size)) return { error: 'Porte inválido.' }
  if (!(payload.rate >= 0)) return { error: 'Tarifa inválida.' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('hospitalization_daily_rates')
    .insert({
      clinic_id: ctx.clinicId,
      category:  payload.category,
      species:   payload.species?.trim() || null,
      size:      payload.size || null,
      rate:      payload.rate,
      active:    true,
    })
    .select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/dashboard/registry')
  return { id: data.id as string }
}

export async function updateDailyRate(
  id: string,
  patch: Partial<CreateDailyRatePayload> & { active?: boolean },
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.category !== undefined) {
    if (!VALID_CATEGORIES.includes(patch.category)) return { error: 'Categoria inválida.' }
    update.category = patch.category
  }
  if (patch.species !== undefined) update.species = patch.species?.trim() || null
  if (patch.size !== undefined) {
    if (patch.size && !VALID_SIZES.includes(patch.size)) return { error: 'Porte inválido.' }
    update.size = patch.size || null
  }
  if (patch.rate !== undefined) {
    if (!(patch.rate >= 0)) return { error: 'Tarifa inválida.' }
    update.rate = patch.rate
  }
  if (patch.active !== undefined) update.active = patch.active

  const admin = createAdminClient()
  const { error } = await admin.from('hospitalization_daily_rates')
    .update(update)
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/registry')
  return { success: true }
}

export async function deleteDailyRate(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin.from('hospitalization_daily_rates')
    .delete().eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/registry')
  return { success: true }
}
