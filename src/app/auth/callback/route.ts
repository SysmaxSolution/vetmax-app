import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const admin = createAdminClient()

        // Verifica se já existe perfil com clinic_id (usuário existente / re-confirmação)
        const { data: profile } = await admin
          .from('profiles')
          .select('clinic_id')
          .eq('id', user.id)
          .single()

        if (!profile?.clinic_id) {
          // Novo cadastro — busca dados salvos antes da confirmação de e-mail.
          // O Supabase sobrescreve user_metadata após confirmation, por isso
          // usamos a tabela pending_registrations como fonte de verdade.
          const { data: pending } = await admin
            .from('pending_registrations')
            .select('full_name, clinic_name')
            .eq('email', user.email!)
            .single()

          const fullName   = pending?.full_name   ?? user.email?.split('@')[0] ?? 'Admin'
          const clinicName = pending?.clinic_name ?? ''

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

              // Registra vínculo multi-clínica
              await admin.from('user_clinics').upsert({
                user_id:   user.id,
                clinic_id: clinic.id,
                role:      'admin',
              }, { onConflict: 'user_id,clinic_id' })

              // Remove registro temporário após uso
              await admin
                .from('pending_registrations')
                .delete()
                .eq('email', user.email!)
            }
          }

          return NextResponse.redirect(`${origin}/email-confirmado`)
        }

        // Usuário existente (convite, re-login) — vai pro dashboard
        return NextResponse.redirect(`${origin}/dashboard`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
