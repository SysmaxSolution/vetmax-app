// Resolução da MARCA do portal (nome, logo, tema) a partir do banco.
//
// Server-only, mas NÃO é `'use server'` de propósito: precisa exportar tipos e
// constantes, e re-exportar tipo de um módulo de actions derruba a rota inteira
// no Turbopack (ver feedback_use_server_type_reexports).
//
// Todo acesso aqui é feito com o admin client — o portal não usa Supabase Auth.
// O isolamento continua sendo responsabilidade de quem CHAMA: nada nestas
// funções decide se a pessoa pode ver a clínica; elas só leem o que foi pedido.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolvePortalTheme, DEFAULT_PORTAL_THEME, portalThemeCssVars,
  slugifyClinicName, uniqueClinicSlug,
  type PortalTheme, type PortalThemeRow,
} from '@/lib/portal/theme'
import type { ClinicSlugRow } from '@/lib/portal/clinic-context'

type Admin = ReturnType<typeof createAdminClient>

export interface PortalBrand {
  clinicId: string | null
  clinicName: string | null
  clinicLogo: string | null
  clinicSlug: string | null
  theme: PortalTheme
}

/** Marca neutra — usada na tela de login e no seletor, antes de haver contexto. */
export const NEUTRAL_PORTAL_BRAND: PortalBrand = {
  clinicId: null, clinicName: null, clinicLogo: null, clinicSlug: null,
  theme: DEFAULT_PORTAL_THEME,
}

/** Nome + logo + tema de UMA clínica. Sem linha de tema ⇒ tema padrão. */
export async function loadPortalBrand(clinicId: string, adminIn?: Admin): Promise<PortalBrand> {
  const admin = adminIn ?? createAdminClient()
  const [{ data: clinic }, { data: settings }, { data: themeRow }] = await Promise.all([
    admin.from('clinics').select('name, logo_url, portal_slug').eq('id', clinicId).maybeSingle(),
    admin.from('clinic_settings').select('logo_url').eq('clinic_id', clinicId).maybeSingle(),
    admin.from('clinic_portal_themes').select('*').eq('clinic_id', clinicId).maybeSingle(),
  ])
  return {
    clinicId,
    clinicName: (clinic as any)?.name ?? null,
    clinicLogo: (clinic as any)?.logo_url ?? (settings as any)?.logo_url ?? null,
    clinicSlug: (clinic as any)?.portal_slug ?? null,
    theme: resolvePortalTheme(themeRow as PortalThemeRow | null),
  }
}

/** Marcas de várias clínicas de uma vez (seletor do tutor multi-clínica). */
export async function loadPortalBrands(clinicIds: string[], adminIn?: Admin): Promise<PortalBrand[]> {
  if (clinicIds.length === 0) return []
  const admin = adminIn ?? createAdminClient()
  const [{ data: clinics }, { data: settings }, { data: themes }] = await Promise.all([
    admin.from('clinics').select('id, name, logo_url, portal_slug').in('id', clinicIds),
    admin.from('clinic_settings').select('clinic_id, logo_url').in('clinic_id', clinicIds),
    admin.from('clinic_portal_themes').select('*').in('clinic_id', clinicIds),
  ])
  const settingsBy = new Map((settings ?? []).map((s: any) => [s.clinic_id, s.logo_url]))
  const themeBy = new Map((themes ?? []).map((t: any) => [t.clinic_id, t]))
  return (clinics ?? []).map((c: any) => ({
    clinicId: c.id as string,
    clinicName: c.name ?? null,
    clinicLogo: c.logo_url ?? settingsBy.get(c.id) ?? null,
    clinicSlug: c.portal_slug ?? null,
    theme: resolvePortalTheme(themeBy.get(c.id) as PortalThemeRow | null),
  }))
}

/**
 * Garante que a clínica tenha slug. A migration 0476 preencheu o acervo, mas
 * clínica criada DEPOIS nasce sem — e o portal não pode depender de alguém
 * abrir a tela de configuração para funcionar. Idempotente: quem já tem, sai
 * intacta. Em corrida (duas requisições ao mesmo tempo), o índice único derruba
 * a segunda gravação e relemos o valor vencedor.
 */
export async function ensurePortalSlug(clinicId: string, adminIn?: Admin): Promise<string | null> {
  const admin = adminIn ?? createAdminClient()
  const { data: clinic } = await admin
    .from('clinics').select('name, portal_slug').eq('id', clinicId).maybeSingle()
  if (!clinic) return null
  if ((clinic as any).portal_slug) return (clinic as any).portal_slug as string

  const { data: taken } = await admin.from('clinics').select('portal_slug').not('portal_slug', 'is', null)
  const slug = uniqueClinicSlug(
    slugifyClinicName((clinic as any).name),
    (taken ?? []).map((c: any) => c.portal_slug as string),
  )
  const { error } = await admin.from('clinics').update({ portal_slug: slug }).eq('id', clinicId)
  if (error) {
    const { data: again } = await admin.from('clinics').select('portal_slug').eq('id', clinicId).maybeSingle()
    return (again as any)?.portal_slug ?? null
  }
  return slug
}

/** Slugs das clínicas informadas — insumo de `resolvePortalClinic`. */
export async function loadClinicSlugs(clinicIds: string[], adminIn?: Admin): Promise<ClinicSlugRow[]> {
  if (clinicIds.length === 0) return []
  const admin = adminIn ?? createAdminClient()
  const { data } = await admin.from('clinics').select('id, portal_slug').in('id', clinicIds)
  return (data ?? []).map((c: any) => ({ id: c.id as string, portal_slug: c.portal_slug ?? null }))
}

/**
 * Dono do pet (tutor + clínica), cru. Serve para o LAYOUT descobrir de qual
 * clínica é o tema da tela `/portal/pet/<id>` — o pet pertence a exatamente uma
 * clínica, então o contexto é inequívoco mesmo sem slug na URL (é assim que os
 * links antigos continuam funcionando, já com a marca certa).
 *
 * NÃO decide acesso: quem chama tem de passar pelo `canAccessPatient`.
 */
export async function loadPetOwnership(
  petId: string, adminIn?: Admin,
): Promise<{ tutorId: string | null; clinicId: string | null }> {
  const admin = adminIn ?? createAdminClient()
  const { data } = await admin
    .from('patients').select('tutor_id, clinic_id')
    .eq('id', petId).is('deleted_at', null).maybeSingle()
  return { tutorId: (data as any)?.tutor_id ?? null, clinicId: (data as any)?.clinic_id ?? null }
}

/** Variáveis CSS prontas para o `style` do elemento raiz do portal. */
export function brandStyle(brand: PortalBrand): React.CSSProperties {
  return portalThemeCssVars(brand.theme) as unknown as React.CSSProperties
}
