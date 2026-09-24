'use server'

// Configuração do white-label do Portal do Tutor, do lado da EQUIPE.
// Gestão › Configurações › "Identidade do Portal do Tutor".
//
// Só admin da clínica escreve, e só na PRÓPRIA clínica: o `clinic_id` nunca vem
// do cliente — sai sempre do perfil do usuário autenticado.
//
// ATENÇÃO: nada de `export type { ... }` aqui (re-export de tipo em 'use server'
// derruba todas as actions da rota no Turbopack). Os tipos moram em
// `@/lib/portal/theme`, que é um módulo puro.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  resolvePortalTheme, sanitizeHex, sanitizeImageUrl, isHeadingFontId,
  slugifyClinicName, uniqueClinicSlug, isValidClinicSlug, DEFAULT_PORTAL_THEME,
  type PortalTheme, type PortalThemeRow,
} from '@/lib/portal/theme'

async function requireClinicAdmin(): Promise<{ clinicId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem alterar a identidade do Portal.' }
  return { clinicId: profile.clinic_id as string }
}

/** Tema efetivo + slug + nome/logo da clínica, para a tela de configuração. */
export async function getClinicPortalIdentity(): Promise<
  | { theme: PortalTheme; slug: string | null; clinicName: string | null; clinicLogo: string | null; hasCustomTheme: boolean }
  | { error: string }
> {
  const gate = await requireClinicAdmin()
  if ('error' in gate) return gate
  const admin = createAdminClient()
  const [{ data: clinic }, { data: row }, { data: settings }] = await Promise.all([
    admin.from('clinics').select('name, logo_url, portal_slug').eq('id', gate.clinicId).maybeSingle(),
    admin.from('clinic_portal_themes').select('*').eq('clinic_id', gate.clinicId).maybeSingle(),
    admin.from('clinic_settings').select('logo_url').eq('clinic_id', gate.clinicId).maybeSingle(),
  ])
  return {
    theme: resolvePortalTheme(row as PortalThemeRow | null),
    slug: (clinic as any)?.portal_slug ?? null,
    clinicName: (clinic as any)?.name ?? null,
    clinicLogo: (clinic as any)?.logo_url ?? (settings as any)?.logo_url ?? null,
    hasCustomTheme: !!row,
  }
}

/**
 * Grava o tema. Cada campo é saneado antes de entrar no banco (hex válido,
 * fonte dentro do conjunto seguro, URL só http(s)) — o portal é servido a
 * terceiros, então valor livre vindo do formulário não vira CSS.
 */
export async function saveClinicPortalTheme(input: {
  bgColor?: string; surfaceColor?: string; primaryColor?: string; primaryDarkColor?: string
  accentColor?: string; textColor?: string; mutedColor?: string; borderColor?: string
  headingFont?: string; coverImageUrl?: string | null; tagline?: string | null
}): Promise<{ success: true } | { error: string }> {
  const gate = await requireClinicAdmin()
  if ('error' in gate) return gate
  const d = DEFAULT_PORTAL_THEME

  const row = {
    clinic_id:          gate.clinicId,
    bg_color:           sanitizeHex(input.bgColor, d.bgColor),
    surface_color:      sanitizeHex(input.surfaceColor, d.surfaceColor),
    primary_color:      sanitizeHex(input.primaryColor, d.primaryColor),
    primary_dark_color: sanitizeHex(input.primaryDarkColor, d.primaryDarkColor),
    accent_color:       sanitizeHex(input.accentColor, d.accentColor),
    text_color:         sanitizeHex(input.textColor, d.textColor),
    muted_color:        sanitizeHex(input.mutedColor, d.mutedColor),
    border_color:       sanitizeHex(input.borderColor, d.borderColor),
    heading_font:       isHeadingFontId(input.headingFont) ? input.headingFont : d.headingFont,
    cover_image_url:    sanitizeImageUrl(input.coverImageUrl),
    tagline:            typeof input.tagline === 'string' && input.tagline.trim()
                          ? input.tagline.trim().slice(0, 60) : null,
    updated_at:         new Date().toISOString(),
  }

  const admin = createAdminClient()
  const { error } = await admin.from('clinic_portal_themes').upsert(row, { onConflict: 'clinic_id' })
  if (error) return { error: 'Erro ao salvar a identidade: ' + error.message }

  revalidatePath('/portal', 'layout')
  revalidatePath('/parceiro', 'layout')
  return { success: true }
}

/** Volta a clínica ao tema padrão do SYSVETMAX (remove a personalização). */
export async function resetClinicPortalTheme(): Promise<{ success: true } | { error: string }> {
  const gate = await requireClinicAdmin()
  if ('error' in gate) return gate
  const admin = createAdminClient()
  const { error } = await admin.from('clinic_portal_themes').delete().eq('clinic_id', gate.clinicId)
  if (error) return { error: 'Erro ao restaurar: ' + error.message }
  revalidatePath('/portal', 'layout')
  return { success: true }
}

/**
 * Define o endereço do portal da clínica (`/portal/c/<slug>`).
 *
 * Vazio ⇒ gera a partir do nome. Colisão ⇒ recusa explícita, em vez de mudar o
 * valor por conta própria: o endereço já pode estar impresso/enviado.
 */
export async function saveClinicPortalSlug(
  raw: string,
): Promise<{ success: true; slug: string } | { error: string }> {
  const gate = await requireClinicAdmin()
  if ('error' in gate) return gate
  const admin = createAdminClient()

  let slug = slugifyClinicName(raw)
  if (!raw.trim()) {
    const { data: clinic } = await admin.from('clinics').select('name').eq('id', gate.clinicId).maybeSingle()
    const { data: taken } = await admin.from('clinics').select('portal_slug').not('portal_slug', 'is', null)
    slug = uniqueClinicSlug(
      slugifyClinicName((clinic as any)?.name),
      (taken ?? []).map((c: any) => c.portal_slug as string).filter(Boolean),
    )
  }
  if (!isValidClinicSlug(slug)) return { error: 'Endereço inválido. Use letras, números e hífen (2 a 40 caracteres).' }

  const { data: clash } = await admin
    .from('clinics').select('id').eq('portal_slug', slug).neq('id', gate.clinicId).maybeSingle()
  if (clash) return { error: `O endereço "${slug}" já está em uso por outra clínica.` }

  const { error } = await admin.from('clinics').update({ portal_slug: slug }).eq('id', gate.clinicId)
  if (error) return { error: 'Erro ao salvar o endereço: ' + error.message }

  revalidatePath('/portal', 'layout')
  return { success: true, slug }
}
