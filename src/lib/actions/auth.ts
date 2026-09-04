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

  if (clinicStatus === 'suspended') {
    await supabase.auth.signOut()
    return {
      error: 'O acesso desta clínica foi suspenso. Entre em contato: suporte@sysmaxsolutions.com',
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

// Cadastro: cria conta e aguarda confirmação de e-mail.
// Suporta criação de nova clínica OU adesão a clínica existente.
export async function signUpWithClinic(
  formData: FormData
): Promise<{ error: string } | { email: string }> {
  const email        = (formData.get('email')         as string ?? '').trim()
  const password     = (formData.get('password')      as string ?? '')
  const fullName     = (formData.get('full_name')     as string ?? '').trim()
  const username     = (formData.get('username')      as string ?? '').trim().toLowerCase()
  const phone        = (formData.get('phone')         as string ?? '').trim()
  const joinCode     = (formData.get('join_code')     as string ?? '').trim().toUpperCase()   // adesão por código
  let   clinicId     = ''                                                        // resolvido do código
  const clinicName   = (formData.get('clinic_name')   as string ?? '').trim()   // nova clínica
  const cnpj         = (formData.get('cnpj')          as string ?? '').replace(/\D/g, '')
  const businessType = (formData.get('business_type') as string ?? 'vet_clinic').trim()
  const termsAccepted = formData.get('terms_accepted') === 'true'

  if (!termsAccepted) {
    return { error: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade para criar uma conta.' }
  }

  if (!email || !password || !fullName) {
    return { error: 'Preencha os campos obrigatórios.' }
  }
  if (!joinCode && !clinicName) {
    return { error: 'Informe o código de acesso da clínica ou o nome da nova clínica.' }
  }
  if (password.length < 8) {
    return { error: 'A senha deve ter no mínimo 8 caracteres.' }
  }
  if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
    return { error: 'Nome de usuário inválido. Use de 3 a 30 letras, números ou _.' }
  }

  const admin = createAdminClient()

  // Adesão a clínica existente: SÓ por código de acesso (fornecido pelo admin da
  // clínica). Não há mais busca pública de clínicas (evita enumeração/adesão
  // indevida ao tenant).
  if (joinCode) {
    const { data: cl } = await admin
      .from('clinics').select('id').eq('join_code', joinCode).eq('status', 'active').maybeSingle()
    if (!cl) return { error: 'Código de acesso inválido. Confirme o código com o administrador da clínica.' }
    clinicId = cl.id as string
  }

  // Verifica e-mail duplicado (Supabase retorna sucesso silencioso)
  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailJaExiste = existingUsers?.users?.some(
    u => u.email?.toLowerCase() === email.toLowerCase()
  )
  if (emailJaExiste) {
    return { error: 'Este e-mail já possui uma conta. Acesse a página de login ou redefina sua senha.' }
  }

  // Verifica username duplicado se fornecido
  if (username) {
    const { data: existingUsername } = await admin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (existingUsername) {
      return { error: `O nome de usuário @${username} já está em uso. Escolha outro.` }
    }
  }

  const supabase = await createClient()
  const { getAppUrl } = await import('@/lib/app-url')
  const appUrl = getAppUrl()

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
      data: { full_name: fullName, clinic_name: clinicName || undefined, clinic_id: clinicId || undefined },
    },
  })

  if (signUpError) {
    return { error: 'Erro ao criar conta: ' + signUpError.message }
  }

  // Captura IP para evidência legal do aceite (persistido em legal_acceptances no callback)
  const { headers } = await import('next/headers')
  const hdrs = await headers()
  const termsIp = hdrs.get('x-forwarded-for')?.split(',')[0].trim()
    ?? hdrs.get('x-real-ip')
    ?? null
  const termsUserAgent = hdrs.get('user-agent') ?? null

  // Persiste dados para o callback recuperar após confirmação de e-mail
  await admin.from('pending_registrations').upsert({
    email,
    full_name:         fullName,
    clinic_name:       clinicName     || null,
    username:          username       || null,
    phone:             phone          || null,
    clinic_id:         clinicId       || null,
    cnpj:              cnpj           || null,
    business_type:     businessType   || 'vet_clinic',
    terms_accepted_at: new Date().toISOString(),
    terms_ip:          termsIp,
    terms_user_agent:  termsUserAgent,
  })

  return { email }
}

/** @deprecated Use signUpWithClinic para novos cadastros de clínica */
export async function signUpUser(formData: FormData) {
  return signUpWithClinic(formData)
}

// ── Código de acesso da clínica (adesão segura — substitui a busca pública) ────
// Só o admin da clínica vê/regenera. Novos usuários entram com este código.
export async function getClinicJoinCode(): Promise<{ code: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem ver o código de acesso.' }
  const admin = createAdminClient()
  let { data: cl } = await admin.from('clinics').select('join_code').eq('id', profile.clinic_id).single()
  if (!cl?.join_code) {
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
    await admin.from('clinics').update({ join_code: code }).eq('id', profile.clinic_id)
    cl = { join_code: code }
  }
  return { code: cl.join_code as string }
}

export async function regenerateClinicJoinCode(): Promise<{ code: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  if (profile.role !== 'admin') return { error: 'Apenas administradores podem regenerar o código.' }
  const admin = createAdminClient()
  const code = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  const { error } = await admin.from('clinics').update({ join_code: code }).eq('id', profile.clinic_id)
  if (error) return { error: error.message }
  return { code }
}

// ── Completa a sessão após OAuth ou phone OTP (seta cookie, roteia) ───────────
export async function completeAuthSession(): Promise<AuthState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão inválida. Faça login novamente.' }

  const admin = createAdminClient()
  const isSysmax = user.email?.toLowerCase() === SYSMAX_EMAIL

  // Sincroniza avatar de OAuth se disponível e ainda não definido
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  if (avatarUrl) {
    await admin.from('profiles')
      .update({ photo_url: avatarUrl })
      .eq('id', user.id)
      .is('photo_url', null)
  }

  if (isSysmax) {
    const { data: allClinics } = await admin.from('clinics').select('id').order('name').limit(1)
    if (!allClinics?.length) return { error: 'Nenhuma clínica cadastrada no sistema.' }
    await admin.from('profiles').upsert({
      id: user.id, clinic_id: allClinics[0].id,
      full_name: 'SysMax Suporte', role: 'admin', is_sysmax: true,
    }, { onConflict: 'id' })
    const cookieStore = await cookies()
    cookieStore.set(ROLE_COOKIE, 'admin', ROLE_COOKIE_OPTIONS)
    redirect('/dashboard')
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role, clinic_id, clinics(status)')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')

  const clinicStatus = (profile.clinics as unknown as { status: string } | null)?.status
  if (clinicStatus === 'suspended') {
    await supabase.auth.signOut()
    return { error: 'O acesso desta clínica foi suspenso. Entre em contato: suporte@sysmaxsolutions.com' }
  }

  const { data: userClinics } = await admin
    .from('user_clinics')
    .select('clinic_id, role, clinics(id, name, status)')
    .eq('user_id', user.id)

  const activeClinics = (userClinics ?? []).filter(uc => {
    const status = (uc.clinics as unknown as { status: string } | null)?.status
    return status === 'active'
  })

  if (activeClinics.length > 1) {
    return {
      selectClinic: true,
      clinics: activeClinics.map(uc => ({
        id:   (uc.clinics as unknown as { id: string }).id,
        name: (uc.clinics as unknown as { name: string }).name,
        role: uc.role,
      })),
    }
  }

  const cookieStore = await cookies()
  cookieStore.set(ROLE_COOKIE, profile.role, ROLE_COOKIE_OPTIONS)

  switch (profile.role) {
    case 'receptionist': redirect('/dashboard/reception')
    case 'vet':          redirect('/dashboard/vet')
    case 'assistant':    redirect('/dashboard/triage')
    case 'pharmacist':   redirect('/dashboard/pharmacy')
    default:             redirect('/dashboard')
  }
}