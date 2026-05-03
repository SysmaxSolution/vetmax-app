'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export type OnboardingState = { error: string } | null

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const fullName = (formData.get('full_name') as string).trim()
  const clinicId = (formData.get('clinic_id') as string | null)?.trim() || null
  const token    = (formData.get('token') as string | null)?.trim() || null

  if (!fullName) return { error: 'Preencha seu nome completo.' }

  const admin = createAdminClient()

  if (clinicId) {
    // ── JOIN MODE: novo usuário ingressa em clínica existente via convite ──
    const email    = (formData.get('email') as string).trim().toLowerCase()
    const password = (formData.get('password') as string)

    if (!email)              return { error: 'Preencha o e-mail.' }
    if (password.length < 8) return { error: 'A senha deve ter no mínimo 8 caracteres.' }

    // Valida clínica
    const { data: clinic } = await admin.from('clinics').select('id, name').eq('id', clinicId).single()
    if (!clinic) return { error: 'Clínica não encontrada. Verifique o link de convite.' }

    // Valida token de convite (obrigatório no join mode)
    if (!token) return { error: 'Token de convite ausente. Use o link enviado pelo administrador.' }

    const { data: invitation } = await admin
      .from('invitations')
      .select('id, email, role, expires_at, accepted_at')
      .eq('token', token)
      .eq('clinic_id', clinicId)
      .single()

    if (!invitation)               return { error: 'Convite não encontrado. Verifique o link.' }
    if (invitation.accepted_at)    return { error: 'Este convite já foi utilizado.' }
    if (new Date(invitation.expires_at) < new Date()) {
      return { error: 'Este convite expirou. Solicite um novo convite ao administrador.' }
    }
    if (invitation.email.toLowerCase() !== email) {
      return { error: `Este convite é para ${invitation.email}. Use o e-mail correto.` }
    }

    const role = invitation.role as string

    // Cria usuário no Auth
    const { data: authData, error: signUpError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (signUpError) {
      if (signUpError.message.includes('already registered') || signUpError.message.includes('already been registered')) {
        return { error: 'Este e-mail já está cadastrado. Faça login normalmente.' }
      }
      return { error: 'Erro ao criar conta: ' + signUpError.message }
    }

    if (!authData.user) return { error: 'Erro inesperado ao criar usuário.' }

    // Cria perfil com role do convite
    const { error: profileError } = await admin.from('profiles').insert({
      id:        authData.user.id,
      clinic_id: clinic.id,
      full_name: fullName,
      role,
    })

    if (profileError) {
      if (profileError.code === '23505') return { error: 'Perfil já cadastrado para este usuário.' }
      return { error: 'Erro ao criar perfil: ' + profileError.message }
    }

    // Registra vínculo multi-clínica
    await admin.from('user_clinics').upsert({
      user_id:   authData.user.id,
      clinic_id: clinic.id,
      role,
    }, { onConflict: 'user_id,clinic_id' })

    // Marca convite como aceito
    await admin
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    // Faz login automático
    const supabase = await createClient()
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) redirect('/login')

  } else {
    // ── CREATE MODE: usuário existente cria nova clínica veterinária ──────
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: 'Sessão inválida. Faça login novamente.' }

    const clinicName = (formData.get('clinic_name') as string).trim()
    if (!clinicName) return { error: 'Preencha o nome da clínica.' }

    const { data: clinic, error: clinicError } = await admin
      .from('clinics')
      .insert({ name: clinicName })
      .select('id')
      .single()

    if (clinicError) return { error: 'Erro ao criar clínica. Tente novamente.' }

    const { error: profileError } = await admin.from('profiles').insert({
      id:        user.id,
      clinic_id: clinic.id,
      full_name: fullName,
      role:      'admin',
    })

    if (profileError) return { error: 'Erro ao criar perfil. Tente novamente.' }

    // Registra vínculo multi-clínica
    await admin.from('user_clinics').upsert({
      user_id:   user.id,
      clinic_id: clinic.id,
      role:      'admin',
    }, { onConflict: 'user_id,clinic_id' })
  }

  redirect('/dashboard')
}
