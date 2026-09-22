'use server'

import { randomBytes } from 'crypto'
import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionSendText } from '@/lib/evolution-api-client'
import {
  normalizeCpf, normalizePhone, checkLoginToken, computeExpiryISO,
  LOGIN_TOKEN_TTL_MS, SESSION_TTL_MS,
} from '@/lib/portal/access'
import { TUTOR_COOKIE } from '@/lib/portal/session'
import {
  generateAccessCode, hashCode, verifyCode, normalizeCode, isLocked, onFail,
} from '@/lib/portal/access-code'
import { encryptCode, decryptCode, maskCode } from '@/lib/portal/code-crypto'

async function getOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'
}

// ─── Convite (staff) — gera link e envia por WhatsApp ────────────────────────
export async function inviteTutorToPortal(
  tutorId: string,
): Promise<{ ok: true; link: string; sent: boolean; phone: string | null; code: string | null; codeAlreadySet: boolean } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { data: tutor } = await admin
    .from('tutors').select('id, clinic_id, name, cpf, phone')
    .eq('id', tutorId).eq('clinic_id', profile.clinic_id).maybeSingle()
  if (!tutor) return { error: 'Tutor não encontrado.' }

  const cpf = normalizeCpf(tutor.cpf)
  const phone = normalizePhone(tutor.phone)

  // find-or-create tutor_user (pessoa) por CPF ou telefone
  let tutorUserId: string | null = null
  if (cpf) {
    const { data } = await admin.from('tutor_users').select('id').eq('cpf', cpf).limit(1).maybeSingle()
    tutorUserId = (data as any)?.id ?? null
  }
  if (!tutorUserId && phone) {
    const { data } = await admin.from('tutor_users').select('id').eq('phone', phone).limit(1).maybeSingle()
    tutorUserId = (data as any)?.id ?? null
  }
  if (!tutorUserId) {
    const { data, error } = await admin.from('tutor_users')
      .insert({ cpf: cpf || null, phone: phone || null, full_name: tutor.name ?? null })
      .select('id').single()
    if (error || !data) return { error: 'Erro ao criar identidade do tutor.' }
    tutorUserId = data.id as string
  }

  // garante o vínculo pessoa ↔ tutor(clínica)
  const { data: link } = await admin.from('tutor_user_links')
    .select('id').eq('tutor_user_id', tutorUserId).eq('tutor_id', tutor.id).maybeSingle()
  if (!link) {
    await admin.from('tutor_user_links').insert({
      tutor_user_id: tutorUserId, tutor_id: tutor.id, clinic_id: tutor.clinic_id, linked_via: 'reception_invite',
    })
  }

  // Código de acesso permanente (CPF + código). Gera se ainda não houver. Só
  // dá para revelar um código recém-gerado (guardamos apenas o hash).
  let accessCode: string | null = null
  const hasCpf = !!cpf
  const { data: tuRow } = await admin.from('tutor_users').select('access_code_hash').eq('id', tutorUserId).maybeSingle()
  if (hasCpf && !(tuRow as any)?.access_code_hash) {
    accessCode = generateAccessCode()
    await admin.from('tutor_users').update({ access_code_hash: hashCode(accessCode), access_code_enc: encryptCode(accessCode), access_code_set_at: new Date().toISOString() }).eq('id', tutorUserId)
  }

  // token de login (uso único) — onboarding/reset via link
  const token = 'tl_' + randomBytes(24).toString('hex')
  await admin.from('tutor_login_tokens').insert({
    tutor_user_id: tutorUserId, clinic_id: tutor.clinic_id, token,
    expires_at: computeExpiryISO(new Date().toISOString(), LOGIN_TOKEN_TTL_MS),
  })

  const link_url = `${await getOrigin()}/portal/entrar?t=${token}`

  // envia por WhatsApp (best-effort)
  let sent = false
  if (phone) {
    const { data: wpp } = await admin.from('clinic_whatsapp_settings')
      .select('evolution_instance_name').eq('clinic_id', tutor.clinic_id).maybeSingle()
    const instanceId = (wpp as any)?.evolution_instance_name
    const apiUrl = process.env.EVOLUTION_API_URL
    const apiKey = process.env.EVOLUTION_API_KEY
    if (instanceId && apiUrl && apiKey) {
      const codeLine = accessCode
        ? `\n\nPara entrar sempre que quiser: use seu *CPF* e o código *${accessCode}*.`
        : ''
      const msg = `Olá${tutor.name ? ' ' + tutor.name.split(' ')[0] : ''}! 🐾\nAcesse a *Área do Tutor* para ver os exames, a carteira de vacinação e o histórico do seu pet:\n${link_url}\n\n_Este link expira em 30 minutos._${codeLine}`
      try {
        const id = await evolutionSendText({ apiUrl, instanceId, apiKey }, phone, msg)
        sent = !!id
      } catch { sent = false }
    }
  }

  return { ok: true, link: link_url, sent, phone: tutor.phone ?? null, code: accessCode, codeAlreadySet: hasCpf && !accessCode }
}

/** Regenera o código de acesso do tutor (staff) e retorna o novo código em texto. */
export async function regenerateTutorAccessCode(tutorId: string): Promise<{ code: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()
  const { data: tutor } = await admin.from('tutors').select('id, clinic_id, cpf, name, phone').eq('id', tutorId).eq('clinic_id', profile.clinic_id).maybeSingle()
  if (!tutor) return { error: 'Tutor não encontrado.' }
  const cpf = normalizeCpf(tutor.cpf)
  if (!cpf) return { error: 'Tutor sem CPF — o login por código exige CPF.' }
  // Garante identidade do tutor no portal (cria se ainda não existe).
  let { data: tu } = await admin.from('tutor_users').select('id').eq('cpf', cpf).limit(1).maybeSingle()
  if (!tu) {
    const { data: created } = await admin.from('tutor_users')
      .insert({ cpf, phone: normalizePhone((tutor as any).phone) || null, full_name: (tutor as any).name ?? null })
      .select('id').single()
    tu = created as any
  }
  if (!tu) return { error: 'Não foi possível criar o acesso do tutor.' }
  const { data: existingLink } = await admin.from('tutor_user_links').select('id').eq('tutor_user_id', (tu as any).id).eq('tutor_id', tutorId).maybeSingle()
  if (!existingLink) {
    await admin.from('tutor_user_links').insert({ tutor_user_id: (tu as any).id, tutor_id: tutorId, clinic_id: tutor.clinic_id, linked_via: 'reception_invite' })
  }

  const code = generateAccessCode()
  await admin.from('tutor_users').update({
    access_code_hash: hashCode(code), access_code_enc: encryptCode(code), access_code_set_at: new Date().toISOString(),
    code_fail_count: 0, code_locked_until: null,
  }).eq('id', (tu as any).id)
  return { code }
}

/** Código atual do tutor (mascarado; revela sob demanda). Staff. */
export async function getTutorAccessCode(tutorId: string, reveal = false): Promise<{ hasCode: boolean; code: string | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const admin = createAdminClient()
  const { data: tutor } = await admin.from('tutors').select('cpf').eq('id', tutorId).eq('clinic_id', profile.clinic_id).maybeSingle()
  const cpf = normalizeCpf((tutor as any)?.cpf)
  if (!cpf) return { hasCode: false, code: null }
  const { data: tu } = await admin.from('tutor_users').select('access_code_hash, access_code_enc').eq('cpf', cpf).limit(1).maybeSingle()
  if (!(tu as any)?.access_code_hash) return { hasCode: false, code: null }
  const full = decryptCode((tu as any).access_code_enc)
  return { hasCode: true, code: full ? (reveal ? full : maskCode(full)) : (reveal ? null : '••••••••') }
}

/** Remove o acesso do tutor: apaga o código e revoga sessões. Staff. */
export async function clearTutorAccess(tutorId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const admin = createAdminClient()
  const { data: tutor } = await admin.from('tutors').select('cpf').eq('id', tutorId).eq('clinic_id', profile.clinic_id).maybeSingle()
  const cpf = normalizeCpf((tutor as any)?.cpf)
  if (!cpf) return { ok: true }
  const { data: tu } = await admin.from('tutor_users').select('id').eq('cpf', cpf).limit(1).maybeSingle()
  if ((tu as any)?.id) {
    await admin.from('tutor_users').update({ access_code_hash: null, access_code_enc: null, access_code_set_at: null, code_fail_count: 0, code_locked_until: null }).eq('id', (tu as any).id)
    await admin.from('tutor_sessions').update({ revoked_at: new Date().toISOString() }).eq('tutor_user_id', (tu as any).id).is('revoked_at', null)
  }
  return { ok: true }
}

// ─── Multi-pet / família: vincula tutores ao mesmo login ─────────────────────
export interface HouseholdMember { tutorId: string; name: string | null; cpf: string | null; pets: number }

/** Tutores da mesma família (vinculados ao mesmo login) — exceto o próprio. */
export async function getHousehold(tutorId: string): Promise<HouseholdMember[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return []
  const admin = createAdminClient()
  const { data: tutor } = await admin.from('tutors').select('cpf').eq('id', tutorId).eq('clinic_id', profile.clinic_id).maybeSingle()
  const cpf = normalizeCpf((tutor as any)?.cpf)
  if (!cpf) return []
  const { data: tu } = await admin.from('tutor_users').select('id').eq('cpf', cpf).limit(1).maybeSingle()
  if (!(tu as any)?.id) return []
  const { data: links } = await admin.from('tutor_user_links').select('tutor_id').eq('tutor_user_id', (tu as any).id)
  const ids = (links ?? []).map((l: any) => l.tutor_id).filter((id: string) => id !== tutorId)
  if (!ids.length) return []
  const { data: tutors } = await admin.from('tutors').select('id, name, cpf').in('id', ids).eq('clinic_id', profile.clinic_id)
  const out: HouseholdMember[] = []
  for (const t of (tutors ?? []) as any[]) {
    const { count } = await admin.from('patients').select('id', { count: 'exact', head: true }).eq('tutor_id', t.id).is('deleted_at', null)
    out.push({ tutorId: t.id, name: t.name ?? null, cpf: t.cpf ?? null, pets: count ?? 0 })
  }
  return out
}

/** Vincula outro tutor (por CPF) ao mesmo login — os pets dele passam a aparecer. */
export async function addHouseholdMember(tutorId: string, memberCpf: string): Promise<{ ok: true; name: string | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const admin = createAdminClient()
  const { data: tutor } = await admin.from('tutors').select('cpf').eq('id', tutorId).eq('clinic_id', profile.clinic_id).maybeSingle()
  const cpf = normalizeCpf((tutor as any)?.cpf)
  if (!cpf) return { error: 'O tutor principal precisa ter CPF e acesso ao portal.' }
  const { data: tu } = await admin.from('tutor_users').select('id').eq('cpf', cpf).limit(1).maybeSingle()
  if (!(tu as any)?.id) return { error: 'Gere primeiro o acesso do tutor principal.' }

  const memberCpfN = normalizeCpf(memberCpf)
  if (memberCpfN.length !== 11) return { error: 'CPF do familiar inválido.' }
  const { data: member } = await admin.from('tutors').select('id, name').eq('clinic_id', profile.clinic_id).eq('cpf', memberCpfN).limit(1).maybeSingle()
  if (!member) return { error: 'Nenhum tutor com esse CPF nesta clínica.' }
  if ((member as any).id === tutorId) return { error: 'Esse é o próprio tutor.' }

  const { data: existing } = await admin.from('tutor_user_links').select('id').eq('tutor_user_id', (tu as any).id).eq('tutor_id', (member as any).id).maybeSingle()
  if (!existing) {
    const { error } = await admin.from('tutor_user_links').insert({
      tutor_user_id: (tu as any).id, tutor_id: (member as any).id, clinic_id: profile.clinic_id, linked_via: 'household',
    })
    if (error) return { error: error.message }
  }
  return { ok: true, name: (member as any).name ?? null }
}

/** Desfaz o vínculo de um familiar. */
export async function removeHouseholdMember(tutorId: string, memberTutorId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const admin = createAdminClient()
  const { data: tutor } = await admin.from('tutors').select('cpf').eq('id', tutorId).eq('clinic_id', profile.clinic_id).maybeSingle()
  const cpf = normalizeCpf((tutor as any)?.cpf)
  if (!cpf) return { error: 'Tutor sem CPF.' }
  const { data: tu } = await admin.from('tutor_users').select('id').eq('cpf', cpf).limit(1).maybeSingle()
  if (!(tu as any)?.id) return { error: 'Login não encontrado.' }
  await admin.from('tutor_user_links').delete().eq('tutor_user_id', (tu as any).id).eq('tutor_id', memberTutorId).eq('clinic_id', profile.clinic_id)
  return { ok: true }
}

// ─── Gera (ou reusa) identidade do tutor e devolve um link de login ──────────
async function ensureTutorLoginLink(
  admin: ReturnType<typeof createAdminClient>,
  tutor: { id: string; clinic_id: string; name: string | null; cpf: string | null; phone: string | null },
): Promise<string> {
  const cpf = normalizeCpf(tutor.cpf)
  const phone = normalizePhone(tutor.phone)
  let tutorUserId: string | null = null
  if (cpf) {
    const { data } = await admin.from('tutor_users').select('id').eq('cpf', cpf).limit(1).maybeSingle()
    tutorUserId = (data as any)?.id ?? null
  }
  if (!tutorUserId && phone) {
    const { data } = await admin.from('tutor_users').select('id').eq('phone', phone).limit(1).maybeSingle()
    tutorUserId = (data as any)?.id ?? null
  }
  if (!tutorUserId) {
    const { data } = await admin.from('tutor_users')
      .insert({ cpf: cpf || null, phone: phone || null, full_name: tutor.name ?? null }).select('id').single()
    tutorUserId = (data as any)?.id ?? null
  }
  if (!tutorUserId) throw new Error('tutor_user')
  const { data: link } = await admin.from('tutor_user_links')
    .select('id').eq('tutor_user_id', tutorUserId).eq('tutor_id', tutor.id).maybeSingle()
  if (!link) {
    await admin.from('tutor_user_links').insert({
      tutor_user_id: tutorUserId, tutor_id: tutor.id, clinic_id: tutor.clinic_id, linked_via: 'reception_invite',
    })
  }
  const token = 'tl_' + randomBytes(24).toString('hex')
  await admin.from('tutor_login_tokens').insert({
    tutor_user_id: tutorUserId, clinic_id: tutor.clinic_id, token,
    expires_at: computeExpiryISO(new Date().toISOString(), LOGIN_TOKEN_TTL_MS),
  })
  return `${await getOrigin()}/portal/entrar?t=${token}`
}

/**
 * Avisa o tutor por WhatsApp que um resultado foi liberado, com link do portal.
 * Best-effort: só envia se a clínica usa o portal (flow_config.portal_enabled) e o
 * tutor tem telefone + WhatsApp configurado. Não lança.
 */
export async function notifyTutorResultReleased(
  tutorId: string, petName: string,
): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient()
    const { data: tutor } = await admin
      .from('tutors').select('id, clinic_id, name, cpf, phone').eq('id', tutorId).maybeSingle()
    if (!tutor || !tutor.phone) return { ok: false }

    const { data: clinic } = await admin.from('clinics').select('flow_config').eq('id', tutor.clinic_id).maybeSingle()
    if ((clinic as any)?.flow_config?.portal_enabled !== true) return { ok: false }

    const { data: wpp } = await admin.from('clinic_whatsapp_settings')
      .select('evolution_instance_name').eq('clinic_id', tutor.clinic_id).maybeSingle()
    const instanceId = (wpp as any)?.evolution_instance_name
    const apiUrl = process.env.EVOLUTION_API_URL, apiKey = process.env.EVOLUTION_API_KEY
    if (!instanceId || !apiUrl || !apiKey) return { ok: false }

    const link = await ensureTutorLoginLink(admin, tutor as any)
    const first = tutor.name ? ' ' + tutor.name.split(' ')[0] : ''
    const msg = `Olá${first}! 🐾\nO resultado do exame de *${petName}* já está disponível na *Área do Tutor*:\n${link}\n\n_Link pessoal, válido por 30 minutos._`
    const id = await evolutionSendText({ apiUrl, instanceId, apiKey }, tutor.phone, msg)
    return { ok: !!id }
  } catch { return { ok: false } }
}

/**
 * Envia uma mensagem ao tutor pelo WhatsApp com um link de login do portal ao
 * final. Best-effort: só envia se a clínica usa o portal e há telefone + WhatsApp.
 * Reutilizado por avisos genéricos (recall de vacina etc.).
 */
export async function sendTutorPortalWhatsApp(tutorId: string, message: string): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient()
    const { data: tutor } = await admin.from('tutors').select('id, clinic_id, name, cpf, phone').eq('id', tutorId).maybeSingle()
    if (!tutor || !tutor.phone) return { ok: false }
    const { data: clinic } = await admin.from('clinics').select('flow_config').eq('id', tutor.clinic_id).maybeSingle()
    if ((clinic as any)?.flow_config?.portal_enabled !== true) return { ok: false }
    const { data: wpp } = await admin.from('clinic_whatsapp_settings').select('evolution_instance_name').eq('clinic_id', tutor.clinic_id).maybeSingle()
    const instanceId = (wpp as any)?.evolution_instance_name
    const apiUrl = process.env.EVOLUTION_API_URL, apiKey = process.env.EVOLUTION_API_KEY
    if (!instanceId || !apiUrl || !apiKey) return { ok: false }
    const link = await ensureTutorLoginLink(admin, tutor as any)
    const id = await evolutionSendText({ apiUrl, instanceId, apiKey }, tutor.phone, `${message}\n${link}`)
    return { ok: !!id }
  } catch { return { ok: false } }
}

// ─── Login permanente por CPF + código ──────────────────────────────────────
async function createTutorSessionRow(
  admin: ReturnType<typeof createAdminClient>, tutorUserId: string,
): Promise<{ token: string; maxAge: number }> {
  const token = 'ts_' + randomBytes(32).toString('hex')
  await admin.from('tutor_sessions').insert({
    tutor_user_id: tutorUserId, session_token: token,
    expires_at: computeExpiryISO(new Date().toISOString(), SESSION_TTL_MS),
  })
  return { token, maxAge: Math.floor(SESSION_TTL_MS / 1000) }
}

export async function loginTutorWithCode(
  cpf: string, code: string,
): Promise<{ ok: true } | { error: string }> {
  const cpfN = normalizeCpf(cpf)
  const codeN = normalizeCode(code)
  if (cpfN.length !== 11) return { error: 'Informe um CPF válido.' }
  if (!codeN) return { error: 'Informe o código de acesso.' }

  const admin = createAdminClient()
  const { data: tu } = await admin
    .from('tutor_users')
    .select('id, access_code_hash, code_fail_count, code_locked_until')
    .eq('cpf', cpfN).limit(1).maybeSingle()

  // Resposta genérica p/ não revelar se o CPF existe
  const generic = { error: 'CPF ou código inválido.' }
  if (!tu) return generic
  if (!(tu as any).access_code_hash) return { error: 'Acesso ainda não configurado. Peça o código à clínica ou use o link do WhatsApp.' }

  const now = new Date().toISOString()
  if (isLocked((tu as any).code_locked_until, now)) return { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }

  if (!verifyCode(codeN, (tu as any).access_code_hash)) {
    const s = onFail((tu as any).code_fail_count ?? 0, now)
    await admin.from('tutor_users').update({ code_fail_count: s.count, code_locked_until: s.lockedUntil }).eq('id', (tu as any).id)
    return generic
  }

  // Só permite se ainda houver vínculo ativo (cadastro na clínica)
  const { count } = await admin.from('tutor_user_links').select('id', { count: 'exact', head: true }).eq('tutor_user_id', (tu as any).id)
  if (!count) return { error: 'Seu acesso não está ativo em nenhuma clínica. Fale com a recepção.' }

  await admin.from('tutor_users').update({ code_fail_count: 0, code_locked_until: null }).eq('id', (tu as any).id)
  const { token, maxAge } = await createTutorSessionRow(admin, (tu as any).id)
  const jar = await cookies()
  jar.set(TUTOR_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge,
  })
  return { ok: true }
}

// ─── Consome o token de login e cria a sessão (usado pela rota /portal/entrar) ─
export async function createTutorSessionFromToken(
  token: string,
): Promise<{ ok: true; sessionToken: string; maxAge: number } | { error: string }> {
  if (!token || !token.startsWith('tl_')) return { error: 'Link inválido.' }
  const admin = createAdminClient()
  const { data: tok } = await admin.from('tutor_login_tokens')
    .select('id, tutor_user_id, expires_at, consumed_at').eq('token', token).maybeSingle()
  if (!tok) return { error: 'Link não encontrado.' }

  const check = checkLoginToken(tok as any, new Date().toISOString())
  if (!check.ok) return { error: check.reason === 'expired' ? 'Link expirado. Peça um novo à clínica.' : 'Este link já foi usado.' }

  // consome (uso único)
  await admin.from('tutor_login_tokens').update({ consumed_at: new Date().toISOString() }).eq('id', tok.id)

  // cria sessão
  const sessionToken = 'ts_' + randomBytes(32).toString('hex')
  await admin.from('tutor_sessions').insert({
    tutor_user_id: tok.tutor_user_id, session_token: sessionToken,
    expires_at: computeExpiryISO(new Date().toISOString(), SESSION_TTL_MS),
  })
  return { ok: true, sessionToken, maxAge: Math.floor(SESSION_TTL_MS / 1000) }
}

// ─── Logout do tutor ──────────────────────────────────────────────────────────
export async function logoutTutor(): Promise<{ ok: true }> {
  const jar = await cookies()
  const token = jar.get(TUTOR_COOKIE)?.value
  if (token) {
    const admin = createAdminClient()
    await admin.from('tutor_sessions').update({ revoked_at: new Date().toISOString() }).eq('session_token', token)
  }
  jar.delete(TUTOR_COOKIE)
  return { ok: true }
}
