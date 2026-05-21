'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type AppearanceMode = 'dynamic' | 'color' | 'image'

export interface UiPreferences {
  intensity:             'normal' | 'intense' | 'off'
  custom_bg:             string | null
  background_image_url?: string | null
  appearance_mode?:      AppearanceMode
  /** Posição horizontal da imagem de fundo (0-100, %). Default 50. */
  background_position_x?: number
  /** Posição vertical da imagem de fundo (0-100, %). Default 50. */
  background_position_y?: number
  /** Escala/zoom da imagem (1.0 = cover, max 3.0). Default 1.0. */
  background_scale?:     number
}

const BRANDING_BUCKET = 'clinic-branding'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME    = ['image/jpeg', 'image/png', 'image/webp']

async function getClinicId(): Promise<{ clinicId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' }
  return { clinicId: profile.clinic_id }
}

export async function saveUiPreferences(prefs: UiPreferences): Promise<{ error?: string }> {
  const ctx = await getClinicId()
  if ('error' in ctx) return { error: ctx.error }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinics')
    .update({ ui_preferences: prefs })
    .eq('id', ctx.clinicId)

  if (error) return { error: error.message }

  revalidatePath('/dashboard', 'layout')
  return {}
}

export async function uploadClinicBackground(formData: FormData): Promise<{ url: string } | { error: string }> {
  const ctx = await getClinicId()
  if ('error' in ctx) return { error: ctx.error }

  const file = formData.get('file') as File | null
  if (!file)                              return { error: 'Arquivo ausente' }
  if (file.size > MAX_IMAGE_BYTES)        return { error: 'Imagem excede 10 MB' }
  if (!ALLOWED_MIME.includes(file.type))  return { error: 'Use JPG, PNG ou WebP' }

  const admin = createAdminClient()
  const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${ctx.clinicId}/background_${Date.now()}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from(BRANDING_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (upErr) return { error: 'Upload falhou: ' + upErr.message }

  const { data: pub } = admin.storage.from(BRANDING_BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl

  // Limpa imagens antigas da clínica (mantém só a mais recente)
  const { data: list } = await admin.storage
    .from(BRANDING_BUCKET)
    .list(ctx.clinicId, { limit: 50 })

  if (list && list.length > 1) {
    const toRemove = list
      .filter(f => !path.endsWith(f.name))
      .map(f => `${ctx.clinicId}/${f.name}`)
    if (toRemove.length > 0) {
      await admin.storage.from(BRANDING_BUCKET).remove(toRemove).catch(() => {})
    }
  }

  // Atualiza ui_preferences imediatamente com a nova URL
  const { data: clinic } = await admin
    .from('clinics')
    .select('ui_preferences')
    .eq('id', ctx.clinicId)
    .single()

  const current = (clinic?.ui_preferences as UiPreferences | null) ?? { intensity: 'normal', custom_bg: null }
  const next: UiPreferences = {
    ...current,
    background_image_url: publicUrl,
    appearance_mode:      'image',
  }

  await admin.from('clinics').update({ ui_preferences: next }).eq('id', ctx.clinicId)

  revalidatePath('/dashboard', 'layout')
  return { url: publicUrl }
}

export async function removeClinicBackground(): Promise<{ error?: string }> {
  const ctx = await getClinicId()
  if ('error' in ctx) return { error: ctx.error }

  const admin = createAdminClient()
  const { data: list } = await admin.storage
    .from(BRANDING_BUCKET)
    .list(ctx.clinicId, { limit: 50 })

  if (list && list.length > 0) {
    const paths = list.map(f => `${ctx.clinicId}/${f.name}`)
    await admin.storage.from(BRANDING_BUCKET).remove(paths).catch(() => {})
  }

  const { data: clinic } = await admin
    .from('clinics')
    .select('ui_preferences')
    .eq('id', ctx.clinicId)
    .single()

  const current = (clinic?.ui_preferences as UiPreferences | null) ?? { intensity: 'normal', custom_bg: null }
  const next: UiPreferences = {
    ...current,
    background_image_url: null,
    appearance_mode:      current.custom_bg ? 'color' : 'dynamic',
  }

  await admin.from('clinics').update({ ui_preferences: next }).eq('id', ctx.clinicId)

  revalidatePath('/dashboard', 'layout')
  return {}
}
