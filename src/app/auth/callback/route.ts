import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  // Password recovery: redirect to reset-password page
  if (type === 'recovery' && code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const admin = createAdminClient()

        // Verifica se já existe perfil com clinic_id (trigger Postgres pode ter criado)
        const { data: profile } = await admin
          .from('profiles')
          .select('clinic_id')
          .eq('id', user.id)
          .single()

        if (!profile?.clinic_id) {
          // Trigger Postgres ainda não rodou ou dados ausentes — tenta criar aqui
          const { data: pending } = await admin
            .from('pending_registrations')
            .select('full_name, clinic_name')
            .ilike('email', user.email!)
            .single()

          const fullName   = pending?.full_name   ?? (user.user_metadata?.full_name   as string | undefined) ?? user.email?.split('@')[0] ?? 'Admin'
          const clinicName = pending?.clinic_name ?? (user.user_metadata?.clinic_name as string | undefined) ?? ''

          if (clinicName) {
            const { data: clinic, error: clinicErr } = await admin
              .from('clinics')
              .insert({ name: clinicName, status: 'pending' })
              .select('id')
              .single()

            if (!clinicErr && clinic) {
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
          }

          return NextResponse.redirect(`${origin}/email-confirmado`)
        }

        // Usuário existente (convite, re-login) — vai pro dashboard
        return NextResponse.redirect(`${origin}/dashboard`)
      }
    }

    // Falha no PKCE (mobile: in-app browser sem cookie) — trigger Postgres já criou a clínica.
    // Redireciona para tela de e-mail confirmado que orienta o usuário a fazer login.
    return NextResponse.redirect(`${origin}/email-confirmado`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
