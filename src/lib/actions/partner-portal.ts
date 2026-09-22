'use server'

import { randomBytes } from 'crypto'
import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { hashCode, verifyCode, isLocked, onFail } from '@/lib/portal/access-code'
import { encryptCode, decryptCode, maskCode } from '@/lib/portal/code-crypto'
import { generatePartnerCode, splitPartnerCode } from '@/lib/portal/partner-code'
import { computeExpiryISO, SESSION_TTL_MS } from '@/lib/portal/access'
import { getPartnerContext, PARTNER_COOKIE } from '@/lib/portal/partner-session'
import type { PartnerProfessional, PartnerReferredPet, PartnerPetImaging } from '@/lib/portal/partner-types'

async function getOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'
}

// ─── Staff (Cadastros) — profissionais e códigos ─────────────────────────────
type Ctx = { clinicId: string; role: string }
async function staffCtx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id as string, role: (profile.role as string) ?? '' }
}

export async function listPartnerProfessionals(partnerClinicId: string): Promise<PartnerProfessional[] | { error: string }> {
  const ctx = await staffCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('partner_clinic_professionals')
    .select('id, name, crmv, email, phone, is_active, code_secret_hash')
    .eq('clinic_id', ctx.clinicId).eq('partner_clinic_id', partnerClinicId)
    .order('name', { ascending: true })
  if (error) return { error: error.message }
  return (data ?? []).map((p: any) => ({
    id: p.id, name: p.name, crmv: p.crmv ?? null, email: p.email ?? null, phone: p.phone ?? null,
    isActive: p.is_active !== false, hasCode: !!p.code_secret_hash,
  }))
}

export async function savePartnerProfessional(input: {
  id?: string; partnerClinicId: string; name: string; crmv?: string | null; email?: string | null; phone?: string | null
}): Promise<{ id: string } | { error: string }> {
  const ctx = await staffCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!input.name.trim()) return { error: 'Nome é obrigatório.' }
  const admin = createAdminClient()
  const rec = {
    clinic_id: ctx.clinicId, partner_clinic_id: input.partnerClinicId,
    name: input.name.trim(), crmv: input.crmv?.trim() || null, email: input.email?.trim() || null, phone: input.phone?.trim() || null,
  }
  if (input.id) {
    const { data, error } = await admin.from('partner_clinic_professionals').update(rec).eq('id', input.id).eq('clinic_id', ctx.clinicId).select('id').single()
    if (error || !data) return { error: 'Erro ao salvar: ' + (error?.message ?? '') }
    return { id: data.id as string }
  }
  const { data, error } = await admin.from('partner_clinic_professionals').insert(rec).select('id').single()
  if (error || !data) return { error: 'Erro ao criar: ' + (error?.message ?? '') }
  return { id: data.id as string }
}

export async function deletePartnerProfessional(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await staffCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { error } = await admin.from('partner_clinic_professionals').delete().eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  return { ok: true }
}

async function uniquePublic(admin: ReturnType<typeof createAdminClient>): Promise<{ publicPart: string; secret: string; code: string }> {
  for (let i = 0; i < 8; i++) {
    const g = generatePartnerCode()
    const [{ data: a }, { data: b }] = await Promise.all([
      admin.from('partner_clinics').select('id').eq('code_public', g.publicPart).maybeSingle(),
      admin.from('partner_clinic_professionals').select('id').eq('code_public', g.publicPart).maybeSingle(),
    ])
    if (!a && !b) return g
  }
  return generatePartnerCode() // colisão improvável
}

/** Gera/regenera o código de um profissional. Retorna o código completo (única vez). */
export async function generatePartnerProfessionalCode(id: string): Promise<{ code: string } | { error: string }> {
  const ctx = await staffCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const g = await uniquePublic(admin)
  const { error } = await admin.from('partner_clinic_professionals').update({
    code_public: g.publicPart, code_secret_hash: hashCode(g.secret), code_enc: encryptCode(g.code), code_set_at: new Date().toISOString(),
    code_fail_count: 0, code_locked_until: null,
  }).eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  return { code: g.code }
}

/** Gera/regenera o código ADMIN da clínica parceira (vê todos os encaminhados). */
export async function generatePartnerClinicAdminCode(partnerClinicId: string): Promise<{ code: string } | { error: string }> {
  const ctx = await staffCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const g = await uniquePublic(admin)
  const { error } = await admin.from('partner_clinics').update({
    code_public: g.publicPart, code_secret_hash: hashCode(g.secret), code_enc: encryptCode(g.code), code_set_at: new Date().toISOString(),
    code_fail_count: 0, code_locked_until: null,
  }).eq('id', partnerClinicId).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/registry')
  return { code: g.code }
}

/** Código atual (mascarado; revela sob demanda) do admin ou de um profissional. */
export async function getPartnerCode(kind: 'admin' | 'professional', id: string, reveal = false): Promise<{ hasCode: boolean; code: string | null } | { error: string }> {
  const ctx = await staffCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const table = kind === 'admin' ? 'partner_clinics' : 'partner_clinic_professionals'
  const { data } = await admin.from(table).select('code_secret_hash, code_enc').eq('id', id).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!(data as any)?.code_secret_hash) return { hasCode: false, code: null }
  const full = decryptCode((data as any).code_enc)
  return { hasCode: true, code: full ? (reveal ? full : maskCode(full)) : (reveal ? null : '•••••-••••••') }
}

/** Remove o acesso (código) do admin ou de um profissional + revoga sessões. */
export async function clearPartnerAccess(kind: 'admin' | 'professional', id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await staffCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const table = kind === 'admin' ? 'partner_clinics' : 'partner_clinic_professionals'
  await admin.from(table).update({ code_public: null, code_secret_hash: null, code_enc: null, code_set_at: null, code_fail_count: 0, code_locked_until: null }).eq('id', id).eq('clinic_id', ctx.clinicId)
  // revoga sessões abertas dessa conta
  const now = new Date().toISOString()
  if (kind === 'admin') await admin.from('partner_clinic_sessions').update({ revoked_at: now }).is('revoked_at', null).eq('partner_clinic_id', id).eq('kind', 'admin')
  else await admin.from('partner_clinic_sessions').update({ revoked_at: now }).is('revoked_at', null).eq('professional_id', id)
  return { ok: true }
}

export async function getPartnerClinicCodeStatus(partnerClinicId: string): Promise<{ adminCodeSet: boolean } | { error: string }> {
  const ctx = await staffCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data } = await admin.from('partner_clinics').select('code_secret_hash').eq('id', partnerClinicId).eq('clinic_id', ctx.clinicId).maybeSingle()
  return { adminCodeSet: !!(data as any)?.code_secret_hash }
}

// ─── Portal (público) — login por código ─────────────────────────────────────
export async function loginPartnerWithCode(code: string): Promise<{ ok: true; kind: 'admin' | 'professional' } | { error: string }> {
  const parts = splitPartnerCode(code)
  if (!parts) return { error: 'Código inválido.' }
  const admin = createAdminClient()
  const now = new Date().toISOString()

  // procura a conta (clínica-admin OU profissional) pela parte pública
  const { data: pc } = await admin.from('partner_clinics')
    .select('id, clinic_id, code_secret_hash, code_fail_count, code_locked_until')
    .eq('code_public', parts.publicPart).maybeSingle()
  const { data: pro } = pc ? { data: null } : await admin.from('partner_clinic_professionals')
    .select('id, clinic_id, partner_clinic_id, code_secret_hash, code_fail_count, code_locked_until, is_active')
    .eq('code_public', parts.publicPart).maybeSingle()

  const acct = pc ?? pro
  if (!acct) return { error: 'Código inválido.' }
  if (pro && (pro as any).is_active === false) return { error: 'Acesso desativado.' }
  if (isLocked((acct as any).code_locked_until, now)) return { error: 'Muitas tentativas. Aguarde alguns minutos.' }

  const table = pc ? 'partner_clinics' : 'partner_clinic_professionals'
  if (!verifyCode(parts.secret, (acct as any).code_secret_hash)) {
    const s = onFail((acct as any).code_fail_count ?? 0, now)
    await admin.from(table).update({ code_fail_count: s.count, code_locked_until: s.lockedUntil }).eq('id', (acct as any).id)
    return { error: 'Código inválido.' }
  }
  await admin.from(table).update({ code_fail_count: 0, code_locked_until: null }).eq('id', (acct as any).id)

  const kind: 'admin' | 'professional' = pc ? 'admin' : 'professional'
  const partnerClinicId = pc ? (pc as any).id : (pro as any).partner_clinic_id
  const token = 'ps_' + randomBytes(32).toString('hex')
  await admin.from('partner_clinic_sessions').insert({
    kind, partner_clinic_id: partnerClinicId, professional_id: pc ? null : (pro as any).id,
    clinic_id: (acct as any).clinic_id, session_token: token,
    expires_at: computeExpiryISO(now, SESSION_TTL_MS),
  })
  const jar = await cookies()
  jar.set(PARTNER_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: Math.floor(SESSION_TTL_MS / 1000) })
  return { ok: true, kind }
}

export async function logoutPartner(): Promise<{ ok: true }> {
  const jar = await cookies()
  const token = jar.get(PARTNER_COOKIE)?.value
  if (token) {
    const admin = createAdminClient()
    await admin.from('partner_clinic_sessions').update({ revoked_at: new Date().toISOString() }).eq('session_token', token)
  }
  jar.delete(PARTNER_COOKIE)
  return { ok: true }
}

// Pets encaminhados por UM profissional (via imaging OU consulta da parceira).
async function professionalReferredPetIds(
  admin: ReturnType<typeof createAdminClient>, professionalId: string, partnerClinicId: string,
): Promise<Set<string>> {
  const ids = new Set<string>()
  const [{ data: st }, { data: cons }] = await Promise.all([
    admin.from('imaging_studies').select('patient_id').eq('referring_professional_id', professionalId),
    admin.from('consultations').select('patient_id').eq('referring_professional_id', professionalId).eq('partner_clinic_id', partnerClinicId),
  ])
  for (const r of (st ?? [])) if ((r as any).patient_id) ids.add((r as any).patient_id)
  for (const r of (cons ?? [])) if ((r as any).patient_id) ids.add((r as any).patient_id)
  return ids
}

// ─── Portal — dados (pets encaminhados) ──────────────────────────────────────
export async function getPartnerReferredPets(): Promise<PartnerReferredPet[] | { error: string }> {
  const ctx = await getPartnerContext()
  if (!ctx) return { error: 'auth' }
  const admin = createAdminClient()

  // Coleta patient_ids encaminhados conforme o tipo de acesso
  const petIds = new Set<string>()
  if (ctx.kind === 'professional') {
    for (const id of await professionalReferredPetIds(admin, ctx.professionalId!, ctx.partnerClinicId)) petIds.add(id)
  } else {
    const [{ data: st }, { data: cons }] = await Promise.all([
      admin.from('imaging_studies').select('patient_id').eq('partner_clinic_id', ctx.partnerClinicId),
      admin.from('consultations').select('patient_id').eq('partner_clinic_id', ctx.partnerClinicId),
    ])
    for (const r of (st ?? [])) petIds.add((r as any).patient_id)
    for (const r of (cons ?? [])) if ((r as any).patient_id) petIds.add((r as any).patient_id)
  }
  const ids = Array.from(petIds).filter(Boolean)
  if (!ids.length) return []

  const { data: pets } = await admin
    .from('patients').select('id, name, species, tutors!tutor_id ( name )').in('id', ids).is('deleted_at', null)
  // contagem de imagem por pet (do escopo)
  const imgQ = admin.from('imaging_studies').select('patient_id').in('patient_id', ids)
  const { data: imgs } = ctx.kind === 'professional'
    ? await imgQ.eq('referring_professional_id', ctx.professionalId!)
    : await imgQ.eq('partner_clinic_id', ctx.partnerClinicId)
  const count: Record<string, number> = {}
  for (const r of (imgs ?? [])) count[(r as any).patient_id] = (count[(r as any).patient_id] ?? 0) + 1

  return (pets ?? []).map((p: any) => ({
    id: p.id, name: p.name, species: p.species ?? null,
    tutorName: (Array.isArray(p.tutors) ? p.tutors[0] : p.tutors)?.name ?? null,
    imagingCount: count[p.id] ?? 0,
  })).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPartnerPetImaging(petId: string): Promise<{ petName: string; imaging: PartnerPetImaging[] } | { error: string }> {
  const ctx = await getPartnerContext()
  if (!ctx) return { error: 'auth' }
  const admin = createAdminClient()

  // Profissional: só pode ver o pet se ele o encaminhou (imaging OU consulta). Fecha IDOR.
  if (ctx.kind === 'professional') {
    const referred = await professionalReferredPetIds(admin, ctx.professionalId!, ctx.partnerClinicId)
    if (!referred.has(petId)) return { error: 'forbidden' }
  }

  let q = admin.from('imaging_studies')
    .select('id, title, modality, laudo_released_at, created_at, patient_id, clinic_id, partner_clinic_id, referring_professional_id, imaging_share_links ( token, audience, revoked_at )')
    .eq('patient_id', petId)
  // Admin: só imagens da própria parceira. Profissional: as que ele encaminhou OU as da sua parceira p/ o pet.
  q = ctx.kind === 'professional'
    ? q.or(`referring_professional_id.eq.${ctx.professionalId},partner_clinic_id.eq.${ctx.partnerClinicId}`)
    : q.eq('partner_clinic_id', ctx.partnerClinicId)
  const { data: studies } = await q.order('created_at', { ascending: false })
  if (!studies || studies.length === 0) return { error: 'forbidden' }

  const { data: pet } = await admin.from('patients').select('name').eq('id', petId).maybeSingle()
  const origin = await getOrigin()

  const imaging: PartnerPetImaging[] = []
  for (const s of studies) {
    let link = (s as any).imaging_share_links?.find((l: any) => l.audience === 'referring_vet' && !l.revoked_at)?.token
    if (!link) {
      link = 'img_' + randomBytes(24).toString('hex')
      await admin.from('imaging_share_links').insert({
        clinic_id: (s as any).clinic_id ?? ctx.clinicId, study_id: (s as any).id, token: link,
        audience: 'referring_vet', expires_at: computeExpiryISO(new Date().toISOString(), 30 * 864e5),
      })
    }
    imaging.push({
      id: (s as any).id, title: (s as any).title ?? null, modality: (s as any).modality ?? null,
      laudoAvailable: !!(s as any).laudo_released_at,
      link: `${origin}/public/laudo/${link}`, createdAt: (s as any).created_at,
    })
  }
  return { petName: (pet as any)?.name ?? 'Paciente', imaging }
}
