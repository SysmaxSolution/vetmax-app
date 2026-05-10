'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'


export type AuthState = { error: string } | { selectClinic: true; clinics: { id: string; name: string; role: string }[] } | null

// E-mail do superadmin SysMax — acesso interno a qualquer clínica
const SYSMAX_EMAIL = 'sysmax@sysmaxsolutions.com'

// Cookie name used by RBAC middleware — value is the user's role
const ROLE_COOKIE = 'vetmax-role'

// Secure cookie options — HttpOnly so JS can't read it, SameSite Lax for normal navigation
const ROLE_COOKIE_OPTIONS = {
  httpOnly:  true,
  sameSite:  'lax'  as const,
  secure:    process.env.NODE_ENV === 'production',
  path:      '/',
  maxAge:    60 * 60 * 24 * 7, // 7 days (matches Supabase session default)
}

export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient()

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) return { error: 'E-mail ou senha incorretos.' }

  const admin = createAdminClient()
  const isSysmax = authData.user.email?.toLowerCase() === SYSMAX_EMAIL

  // ── SysMax Superadmin: entra direto na primeira clínica ──
  if (isSysmax) {
    const { data: allClinics } = await admin
      .from('clinics')
      .select('id, name')
      .order('name')
      .limit(1)

    if (!allClinics || allClinics.length === 0) {
      await supabase.auth.signOut()
      return { error: 'Nenhuma clínica cadastrada no sistema.' }
    }

    const firstClinic = allClinics[0]

    // Garante profile do SysMax apontando para a primeira clínica
    await admin.from('profiles').upsert({
      id:        authData.user.id,
      clinic_id: firstClinic.id,
      full_name: 'SysMax Suporte',
      role:      'admin',
      is_sysmax: true,
    }, { onConflict: 'id' })

    const cookieStore = await cookies()
    cookieStore.set(ROLE_COOKIE, 'admin', ROLE_COOKIE_OPTIONS)

    redirect('/dashboard')
  }

  // ── Fluxo normal ──
  const { data: profile } = await admin
    .from('profiles')
    .select('role, clinic_id, clinics(status)')
    .eq('id', authData.user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')

  // Verificar status da clínica antes de permitir acesso
  const clinicStatus = (profile.clinics as unknown as { status: string } | null)?.status

  if (clinicStatus === 'pending') {
    await supabase.auth.signOut()
    return {
      error: 'Sua clínica ainda está aguardando liberação de acesso pela equipe SysMax. Entre em contato: suporte@sysmaxsolutions.com',
    }
  }

  if (clinicStatus === 'blocked') {
    await supabase.auth.signOut()
    return {
      error: 'O acesso desta clínica foi bloqueado. Entre em contato: suporte@sysmaxsolutions.com',
    }
  }

  // Verificar se o usuário tem vínculo com múltiplas clínicas
  const { data: userClinics } = await admin
    .from('user_clinics')
    .select('clinic_id, role, clinics(id, name, status)')
    .eq('user_id', authData.user.id)

  const activeClinics = (userClinics ?? []).filter(uc => {
    const status = (uc.clinics as unknown as { status: string } | null)?.status
    return status === 'active'
  })

  if (activeClinics.length > 1) {
    // Múltiplas clínicas — retorna lista para o frontend exibir o seletor
    return {
      selectClinic: true,
      clinics: activeClinics.map(uc => ({
        id:   (uc.clinics as unknown as { id: string }).id,
        name: (uc.clinics as unknown as { name: string }).name,
        role: uc.role,
      })),
    }
  }

  // Persiste role em cookie para que o proxy RBAC possa ler sem query ao banco
  const cookieStore = await cookies()
  cookieStore.set(ROLE_COOKIE, profile.role, ROLE_COOKIE_OPTIONS)

  // Roteamento direto por papel — evita duplo redirect via /dashboard
  switch (profile.role) {
    case 'receptionist': redirect('/dashboard/reception')
    case 'vet':          redirect('/dashboard/vet')
    case 'assistant':    redirect('/dashboard/triage')
    case 'pharmacist':   redirect('/dashboard/pharmacy')
    default:             redirect('/dashboard') // admin + fallback
  }
}

// Seleciona clínica ativa e redireciona para o dashboard
export async function selectClinic(clinicId: string): Promise<AuthState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão inválida. Faça login novamente.' }

  const admin = createAdminClient()
  const isSysmax = user.email?.toLowerCase() === SYSMAX_EMAIL

  let role = 'admin'

  if (isSysmax) {
    // SysMax superadmin: acessa qualquer clínica como admin
    // Garante que o profile existe (upsert)
    await admin.from('profiles').upsert({
      id:        user.id,
      clinic_id: clinicId,
      full_name: 'SysMax Suporte',
      role:      'admin',
      is_sysmax: true,
    }, { onConflict: 'id' })
  } else {
    // Usuário normal: valida vínculo
    const { data: link } = await admin
      .from('user_clinics')
      .select('role')
      .eq('user_id', user.id)
      .eq('clinic_id', clinicId)
      .single()

    if (!link) return { error: 'Você não tem acesso a esta clínica.' }
    role = link.role

    // Atualiza clínica ativa no profile
    await admin
      .from('profiles')
      .update({ clinic_id: clinicId, role: link.role })
      .eq('id', user.id)
  }

  // Persiste role em cookie
  const cookieStore = await cookies()
  cookieStore.set(ROLE_COOKIE, role, ROLE_COOKIE_OPTIONS)

  switch (role) {
    case 'receptionist': redirect('/dashboard/reception')
    case 'vet':          redirect('/dashboard/vet')
    case 'assistant':    redirect('/dashboard/triage')
    case 'pharmacist':   redirect('/dashboard/pharmacy')
    default:             redirect('/dashboard')
  }
}

export async function signup(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) return { error: 'Não foi possível criar a conta. Tente novamente.' }
  redirect('/onboarding')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Limpa o cookie de role ao fazer logout
  const cookieStore = await cookies()
  cookieStore.delete(ROLE_COOKIE)
  redirect('/login')
}

// Cadastro de nova clínica: armazena metadados no Auth e aguarda confirmação de e-mail
export async function signUpWithClinic(
  formData: FormData
): Promise<{ error: string } | { email: string }> {
  const email      = (formData.get('email')       as string).trim()
  const password   =  formData.get('password')    as string
  const fullName   = (formData.get('full_name')   as string).trim()
  const clinicName = (formData.get('clinic_name') as string).trim()

  if (!email || !password || !fullName || !clinicName) {
    return { error: 'Preencha todos os campos.' }
  }
  if (password.length < 8) {
    return { error: 'A senha deve ter no mínimo 8 caracteres.' }
  }

  const admin = createAdminClient()

  // Verificar se e-mail já está cadastrado antes do signUp.
  // O Supabase retorna sucesso silencioso para e-mails duplicados,
  // deixando o usuário preso numa falsa espera de confirmação.
  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailJaExiste = existingUsers?.users?.some(
    u => u.email?.toLowerCase() === email.toLowerCase()
  )
  if (emailJaExiste) {
    return {
      error: 'Este e-mail já possui uma conta cadastrada. Acesse a página de login ou redefina sua senha.',
    }
  }

  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://vetmax-one.vercel.app'

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
      // Armazena dados no user_metadata para o trigger Postgres (G-01)
      // acessar mesmo quando o callback falha em mobile (sem cookie PKCE)
      data: { full_name: fullName, clinic_name: clinicName },
    },
  })

  if (error) {
    return { error: 'Erro ao criar conta: ' + error.message }
  }

  // Salva dados do cadastro para recuperar no /auth/callback após confirmação.
  // O Supabase sobrescreve user_metadata após email confirmation, então
  // persistimos aqui via service role antes de o usuário clicar no link.
  await admin.from('pending_registrations').upsert({
    email,
    full_name:   fullName,
    clinic_name: clinicName,
  })

  // Retorna o e-mail para o componente exibir a tela de "confirme seu e-mail"
  return { email }
}

/** @deprecated Use signUpWithClinic para novos cadastros de clínica */
export async function signUpUser(formData: FormData) {
  return signUpWithClinic(formData)
}