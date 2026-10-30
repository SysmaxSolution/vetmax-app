import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { getAppUrl } from '@/lib/app-url'
import { garantirPerfilDoCadastro } from '@/lib/server/garantir-perfil'

const ROLE_COOKIE = 'vetmax-role'
const ROLE_COOKIE_OPTIONS = {
  httpOnly:  true,
  sameSite:  'lax'  as const,
  secure:    process.env.NODE_ENV === 'production',
  path:      '/',
  maxAge:    60 * 60 * 24 * 7,
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

  // /dashboard escolhe o primeiro módulo liberado ao usuário
  // (src/lib/dashboard/modulo-inicial.ts); destino fixo por papel podia cair
  // num módulo bloqueado e virar loop de redirecionamento.
  return NextResponse.redirect(`${origin}/dashboard`)
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
      await garantirPerfilDoCadastro(data.user)
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
      await garantirPerfilDoCadastro(data.user)
      return NextResponse.redirect(`${origin}/email-confirmado`)
    }

    // Fallback mobile (trigger Postgres já criou a clínica)
    return NextResponse.redirect(`${origin}/email-confirmado`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}

