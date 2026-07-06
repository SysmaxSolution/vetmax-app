import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { getAppUrl } from '@/lib/app-url'
import { insertLegalAcceptanceRaw } from '@/lib/actions/legal'
import { sendFreeSignupAlert } from '@/lib/signup-alert'

const ROLE_COOKIE = 'vetmax-role'
const ROLE_COOKIE_OPTIONS = {
  httpOnly:  true,
  sameSite:  'lax'  as const,
  secure:    process.env.NODE_ENV === 'production',
  path:      '/',
  maxAge:    60 * 60 * 24 * 7,
}

// ─── Garante que clínica e perfil existam para o usuário confirmado (email) ───
async function ensureClinicCreated(user: User): Promise<void> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (profile?.clinic_id) return

  const { data: pending } = await admin
    .from('pending_registrations')
    .select('full_name, clinic_name, clinic_id, username, phone, cnpj, business_type, terms_accepted_at, terms_ip, terms_user_agent')
    .ilike('email', user.email!)
    .single()

  const fullName   = pending?.full_name   ?? (user.user_metadata?.full_name   as string | undefined) ?? user.email?.split('@')[0] ?? 'Admin'
  const clinicName = pending?.clinic_name ?? (user.user_metadata?.clinic_name as string | undefined) ?? ''
  const existingClinicId = pending?.clinic_id ?? (user.user_metadata?.clinic_id as string | undefined)

  // Usuário aderindo a clínica existente
  if (existingClinicId) {
    await admin.from('profiles').upsert({
      id:        user.id,
      clinic_id: existingClinicId,
      full_name: fullName,
      username:  pending?.username ?? null,
      phone:     pending?.phone    ?? null,
      role:      'receptionist', // papel padrão; admin da clínica pode elevar
    })
    await admin.from('user_clinics').upsert({
      user_id:   user.id,
      clinic_id: existingClinicId,
      role:      'receptionist',
    }, { onConflict: 'user_id,clinic_id' })
    if (pending?.terms_accepted_at) {
      await insertLegalAcceptanceRaw({
        clinicId:     existingClinicId,
        userId:       user.id,
        documentType: 'terms_privacy_dpa',
        ip:           (pending as { terms_ip?: string | null }).terms_ip ?? null,
        userAgent:    (pending as { terms_user_agent?: string | null }).terms_user_agent ?? null,
      })
    }
    await admin.from('pending_registrations').delete().eq('email', user.email!)
    return
  }

  if (!clinicName) return

  // Cria nova clínica — nasce ativa (PLG: sem aprovação manual)
  const insertData: Record<string, unknown> = {
    name:          clinicName,
    business_type: pending?.business_type ?? 'vet_clinic',
  }
  if (pending?.cnpj && isValidCnpj(pending.cnpj)) insertData.cnpj = pending.cnpj

  const { data: clinic, error: clinicErr } = await admin
    .from('clinics')
    .insert(insertData)
    .select('id')
    .single()

  if (clinicErr || !clinic) return

  await admin.from('profiles').upsert({
    id:        user.id,
    clinic_id: clinic.id,
    full_name: fullName,
    username:  pending?.username ?? null,
    phone:     pending?.phone    ?? null,
    role:      'admin',
  })
  await admin.from('user_clinics').upsert({
    user_id:   user.id,
    clinic_id: clinic.id,
    role:      'admin',
  }, { onConflict: 'user_id,clinic_id' })

  // Notifica o time comercial no WhatsApp (clínica nova nasce no Free). Não
  // bloqueia nem quebra o cadastro — falha em silêncio.
  void sendFreeSignupAlert({
    clinicName: clinicName,
    adminName:  fullName,
    phone:      pending?.phone ?? null,
    cnpj:       (insertData.cnpj as string | undefined) ?? null,
  })

  if (pending?.terms_accepted_at) {
    await insertLegalAcceptanceRaw({
      clinicId:     clinic.id,
      userId:       user.id,
      documentType: 'terms_privacy_dpa',
      ip:           (pending as { terms_ip?: string | null }).terms_ip ?? null,
      userAgent:    (pending as { terms_user_agent?: string | null }).terms_user_agent ?? null,
    })
  }
  await admin.from('pending_registrations').delete().eq('email', user.email!)
}

// ─── Roteia usuário OAuth para o dashboard correto ────────────────────────────
async function routeOAuthUser(user: User, origin: string): Promise<NextResponse> {
  const admin = createAdminClient()

  // Sincroniza avatar OAuth → photo_url (apenas se não tiver foto própria)
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  if (avatarUrl) {
    await admin.from('profiles')
      .update({ photo_url: avatarUrl })
      .eq('id', user.id)
      .is('photo_url', null)
  }

  // Garante nome completo populado a partir do provider
  const providerName = user.user_metadata?.full_name as string | undefined
    ?? user.user_metadata?.name as string | undefined
  if (providerName) {
    await admin.from('profiles')
      .update({ full_name: providerName })
      .eq('id', user.id)
      .is('full_name', null)
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role, clinic_id, clinics(status)')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) {
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  const clinicStatus = (profile.clinics as unknown as { status: string } | null)?.status
  if (clinicStatus === 'suspended') {
    return NextResponse.redirect(`${origin}/login?error=clinic_suspended`)
  }

  const cookieStore = await cookies()
  cookieStore.set(ROLE_COOKIE, profile.role, ROLE_COOKIE_OPTIONS)

  const destinations: Record<string, string> = {
    receptionist: '/dashboard/reception',
    vet:          '/dashboard/vet',
    assistant:    '/dashboard/triage',
    pharmacist:   '/dashboard/pharmacy',
  }
  return NextResponse.redirect(`${origin}${destinations[profile.role] ?? '/dashboard'}`)
}

// ─── GET /auth/callback ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = (searchParams.get('type') ?? '') as string

  // Domínio canônico — força redirect para sysvetmax.sysmaxsolutions.com mesmo
  // quando o link de email chegou por um subdomínio Vercel obsoleto.
  const origin = getAppUrl()

  // ── Path 1: Password Recovery (PKCE) ──────────────────────────────────────
  if (type === 'recovery' && code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  // ── Path 2: Email OTP / token_hash ────────────────────────────────────────
  if (token_hash && type) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email',
    })

    if (!error && data.user) {
      if (type === 'recovery') return NextResponse.redirect(`${origin}/reset-password`)
      await ensureClinicCreated(data.user)
      return NextResponse.redirect(`${origin}/email-confirmado`)
    }
    return NextResponse.redirect(`${origin}/login?error=token_invalid`)
  }

  // ── Path 3: PKCE Code Exchange (OAuth Google ou email signup) ─────────────
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const provider = data.user.app_metadata?.provider as string | undefined
      const isOAuth = provider && provider !== 'email'

      if (isOAuth) {
        return routeOAuthUser(data.user, origin)
      }

      // Email signup confirmation
      await ensureClinicCreated(data.user)
      return NextResponse.redirect(`${origin}/email-confirmado`)
    }

    // Fallback mobile (trigger Postgres já criou a clínica)
    return NextResponse.redirect(`${origin}/email-confirmado`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}

function isValidCnpj(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (s: string, weights: number[]) =>
    weights.reduce((sum, w, i) => sum + parseInt(s[i]) * w, 0)
  const r1 = calc(d, [5,4,3,2,9,8,7,6,5,4,3,2])
  const v1 = r1 % 11 < 2 ? 0 : 11 - (r1 % 11)
  const r2 = calc(d, [6,5,4,3,2,9,8,7,6,5,4,3,2])
  const v2 = r2 % 11 < 2 ? 0 : 11 - (r2 % 11)
  return parseInt(d[12]) === v1 && parseInt(d[13]) === v2
}
