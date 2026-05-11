import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

// ─── Garante que clínica e perfil existam para o usuário confirmado ───────────
async function ensureClinicCreated(user: User): Promise<void> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (profile?.clinic_id) return  // trigger Postgres já criou — nada a fazer

  // Fallback explícito: trigger não disparou ou migração ausente em staging
  const { data: pending } = await admin
    .from('pending_registrations')
    .select('full_name, clinic_name')
    .ilike('email', user.email!)
    .single()

  const fullName   = pending?.full_name   ?? (user.user_metadata?.full_name   as string | undefined) ?? user.email?.split('@')[0] ?? 'Admin'
  const clinicName = pending?.clinic_name ?? (user.user_metadata?.clinic_name as string | undefined) ?? ''

  if (!clinicName) return  // convite ou fluxo externo — não cria clínica

  const { data: clinic, error: clinicErr } = await admin
    .from('clinics')
    .insert({ name: clinicName, status: 'pending' })
    .select('id')
    .single()

  if (clinicErr || !clinic) return

  await admin.from('profiles').upsert({
    id:        user.id,
    clinic_id: clinic.id,
    full_name: fullName,
    role:      'admin',
  })
  await admin.from('user_clinics').upsert({
    user_id:   user.id,
    clinic_id: clinic.id,
    role:      'admin',
  }, { onConflict: 'user_id,clinic_id' })
  await admin.from('pending_registrations').delete().eq('email', user.email!)
}

// ─── GET /auth/callback ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = (searchParams.get('type') ?? '') as string

  // ── Path 1: Password Recovery (PKCE) ──────────────────────────────────────
  if (type === 'recovery' && code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  // ── Path 2: Email OTP / token_hash (mobile-friendly, sem PKCE) ────────────
  // Supabase envia token_hash quando o projeto usa "Email OTP" em vez de PKCE.
  // Também ocorre quando o link de confirmação é aberto em browser diferente.
  if (token_hash && type) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as any,
    })

    if (!error && data.user) {
      if (type === 'recovery') return NextResponse.redirect(`${origin}/reset-password`)
      await ensureClinicCreated(data.user)
      return NextResponse.redirect(`${origin}/email-confirmado`)
    }
    // token inválido ou expirado — cai no erro genérico
    return NextResponse.redirect(`${origin}/login?error=token_invalid`)
  }

  // ── Path 3: PKCE Code Exchange (desktop / mesmo browser) ──────────────────
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      await ensureClinicCreated(data.user)
      return NextResponse.redirect(`${origin}/email-confirmado`)
    }

    // PKCE falhou — browser diferente (mobile in-app browser sem cookie de sessão).
    // O trigger Postgres (migration 0093) já criou a clínica quando email_confirmed_at
    // foi definido. Redireciona para /email-confirmado; usuário faz login normalmente.
    return NextResponse.redirect(`${origin}/email-confirmado`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
