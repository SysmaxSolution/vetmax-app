'use server'

/**
 * Fontes por clínica — server actions (bucket privado `clinic-fonts`,
 * tabela `clinic_fonts`, RLS por clinic_id — migration 0465).
 *
 * Fluxo de upload (mesmo padrão do papel timbrado):
 *   1. getClinicFontUploadUrl(filename) → PUT do browser na signed URL
 *   2. registerClinicFont({...storage_path}) → linha em clinic_fonts
 * Leitura: listClinicFonts() devolve signed URLs (1 ano) para @font-face.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClinicFontFace } from '@/lib/canva/fonts'
import { fontFormatFromFilename, CLINIC_FONT_MAX_BYTES } from '@/lib/canva/fonts'

const FONT_BUCKET = 'clinic-fonts'
const READ_TTL_SECONDS = 60 * 60 * 24 * 365

async function requireClinic() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .single()
  if (error || !profile?.clinic_id) throw new Error('no clinic')
  return { supabase, user, profile }
}

/** Fontes da clínica do usuário logado, já com URL assinada. Nunca lança
 *  (devolve [] em erro) — o print não pode quebrar por causa de fonte. */
export async function listClinicFonts(): Promise<ClinicFontFace[]> {
  try {
    const { supabase, profile } = await requireClinic()
    const { data, error } = await supabase
      .from('clinic_fonts')
      .select('id, family_name, storage_path, format, font_weight, font_style')
      .eq('clinic_id', profile.clinic_id)
      .order('family_name', { ascending: true })
    if (error || !data || data.length === 0) return []

    const admin = createAdminClient()
    const { data: signed } = await admin.storage
      .from(FONT_BUCKET)
      .createSignedUrls(data.map(f => f.storage_path), READ_TTL_SECONDS)
    const urlByPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]))

    return data
      .map(f => ({
        id: f.id,
        family_name: f.family_name,
        url: urlByPath.get(f.storage_path) ?? '',
        format: f.format as ClinicFontFace['format'],
        font_weight: Number(f.font_weight ?? 400),
        font_style: (f.font_style === 'italic' ? 'italic' : 'normal') as ClinicFontFace['font_style'],
      }))
      .filter(f => f.url)
  } catch {
    return []
  }
}

export async function getClinicFontUploadUrl(filename: string): Promise<{
  upload_url: string
  storage_path: string
  format: ClinicFontFace['format']
}> {
  const { profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode enviar fontes')

  const format = fontFormatFromFilename(filename)
  if (!format) throw new Error('formato inválido — use TTF, OTF, WOFF ou WOFF2')
  const ext = filename.split('.').pop()!.toLowerCase()
  const path = `${profile.clinic_id}/${crypto.randomUUID()}.${ext}`

  const admin = createAdminClient()
  const { data: upload, error } = await admin.storage.from(FONT_BUCKET).createSignedUploadUrl(path)
  if (error || !upload) throw new Error(error?.message ?? 'falha ao gerar URL de upload')
  return { upload_url: upload.signedUrl, storage_path: path, format }
}

export interface RegisterClinicFontInput {
  family_name: string
  storage_path: string
  format: ClinicFontFace['format']
  font_weight?: number
  font_style?: 'normal' | 'italic'
  file_size?: number
}

export async function registerClinicFont(input: RegisterClinicFontInput): Promise<{ id: string }> {
  const { supabase, profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode enviar fontes')
  if (!input.storage_path.startsWith(`${profile.clinic_id}/`)) throw new Error('caminho fora do escopo da clínica')

  const family = input.family_name.trim().replace(/["\\]/g, '')
  if (!family || family.length > 80) throw new Error('nome da família inválido')
  if (input.file_size != null && input.file_size > CLINIC_FONT_MAX_BYTES) throw new Error('arquivo acima de 5 MB')
  const weight = Math.min(900, Math.max(100, Math.round(input.font_weight ?? 400)))

  const { data, error } = await supabase
    .from('clinic_fonts')
    .upsert({
      clinic_id: profile.clinic_id,
      family_name: family,
      storage_path: input.storage_path,
      format: input.format,
      font_weight: weight,
      font_style: input.font_style === 'italic' ? 'italic' : 'normal',
      file_size: input.file_size ?? null,
      created_by: profile.id,
    }, { onConflict: 'clinic_id,family_name,font_weight,font_style' })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'falha ao registrar fonte')
  revalidatePath('/dashboard/management')
  return { id: data.id }
}

export async function deleteClinicFont(fontId: string): Promise<{ ok: true }> {
  const { supabase, profile } = await requireClinic()
  if (profile.role !== 'admin') throw new Error('apenas admin pode remover fontes')

  const { data: font, error } = await supabase
    .from('clinic_fonts')
    .delete()
    .eq('id', fontId)
    .eq('clinic_id', profile.clinic_id)
    .select('storage_path')
    .single()
  if (error || !font) throw new Error(error?.message ?? 'fonte não encontrada')

  // Best-effort: remove o arquivo (a linha já foi apagada)
  const admin = createAdminClient()
  await admin.storage.from(FONT_BUCKET).remove([font.storage_path]).catch(() => undefined)
  revalidatePath('/dashboard/management')
  return { ok: true }
}
