'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import type { InvitationRole, Invitation } from '@/types'

import { sendInviteEmail } from '@/lib/actions/send-invite-email'

export type InvitationState = { error: string } | { url: string; token: string; emailSent?: boolean } | null

export async function createInvitation(
  _prevState: InvitationState,
  formData: FormData
): Promise<InvitationState> {
  const email = (formData.get('email') as string).trim().toLowerCase()
  const role  = formData.get('role') as InvitationRole

  if (!email) return { error: 'Informe o e-mail do convidado.' }
  if (!['vet', 'assistant', 'receptionist', 'pharmacist'].includes(role)) {
    return { error: 'Role inválida.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão inválida.' }

  const admin = createAdminClient()

  // Busca perfil do admin (clinic_id + role)
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id || profile.role !== 'admin') {
    return { error: 'Apenas administradores podem convidar usuários.' }
  }

  // Verifica limite de usuários
  const { data: clinic } = await admin
    .from('clinics')
    .select('user_limit')
    .eq('id', profile.clinic_id)
    .single()

  const { count: currentUsers } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', profile.clinic_id)

  if (clinic && currentUsers !== null && currentUsers >= clinic.user_limit) {
    return {
      error: `Limite de ${clinic.user_limit} usuários atingido no seu plano atual. Fale com a Sysmax Solutions pelo WhatsApp (16) 99702-3340 ou e-mail contato@sysmaxsolutions.com para fazer upgrade.`,
    }
  }

  // Invalida convites anteriores para o mesmo e-mail nesta clínica
  await admin
    .from('invitations')
    .delete()
    .eq('clinic_id', profile.clinic_id)
    .eq('email', email)
    .is('accepted_at', null)

  // Cria novo convite
  const { data: invitation, error } = await admin
    .from('invitations')
    .insert({
      clinic_id:  profile.clinic_id,
      email,
      role,
      invited_by: user.id,
    })
    .select('token')
    .single()

  if (error || !invitation) {
    return { error: 'Erro ao gerar convite. Tente novamente.' }
  }

  return {
    token: invitation.token,
    url:   `${getAppUrl()}/invite/${invitation.token}`,
  }
}

export async function getClinicInvitations(): Promise<Invitation[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id || profile.role !== 'admin') return []

  const { data } = await admin
    .from('invitations')
    .select('id, clinic_id, email, role, token, invited_by, accepted_at, expires_at, created_at')
    .eq('clinic_id', profile.clinic_id)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return (data as Invitation[]) ?? []
}

export async function revokeInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão inválida.' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id || profile.role !== 'admin') {
    return { error: 'Apenas administradores podem revogar convites.' }
  }

  const { error } = await admin
    .from('invitations')
    .delete()
    .eq('id', invitationId)
    .eq('clinic_id', profile.clinic_id)

  return error ? { error: 'Erro ao revogar convite.' } : {}
}

// Chamado pela página /invite/[token] — não requer autenticação
export async function fetchInvitationByToken(token: string): Promise<{
  invitation: Invitation & { clinic_name: string; inviter_name: string } | null
  /** Quando o convite já foi usado, devolvemos o email para a UI orientar o login. */
  alreadyAccepted?: { email: string; clinic_name: string; accepted_at: string }
  error?: string
}> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('invitations')
    .select('id, clinic_id, email, role, token, invited_by, accepted_at, expires_at, created_at')
    .eq('token', token)
    .single()

  if (error || !data) return { invitation: null, error: 'Convite não encontrado.' }

  // Busca nome da clínica e do convidante (usado nos 3 caminhos abaixo)
  const [clinicResult, inviterResult] = await Promise.all([
    admin.from('clinics').select('name').eq('id', data.clinic_id).single(),
    admin.from('profiles').select('full_name').eq('id', data.invited_by).single(),
  ])

  if (data.accepted_at) {
    // Caso "convite já foi aceito": NÃO é erro do sistema. Retorna info para a
    // UI exibir uma mensagem positiva e oferecer login / recuperação de senha.
    return {
      invitation: null,
      alreadyAccepted: {
        email:       data.email,
        clinic_name: clinicResult.data?.name ?? 'Clínica',
        accepted_at: data.accepted_at,
      },
    }
  }

  if (new Date(data.expires_at) < new Date()) {
    return { invitation: null, error: 'Este convite expirou. Solicite um novo convite ao administrador.' }
  }

  return {
    invitation: {
      ...(data as Invitation),
      clinic_name:  clinicResult.data?.name ?? 'Clínica',
      inviter_name: inviterResult.data?.full_name ?? 'Administrador',
    },
  }
}

// Cria convite E envia email automaticamente
export async function createAndSendInvitation(
  _prevState: InvitationState,
  formData: FormData
): Promise<InvitationState> {
  // Reutiliza toda a lógica de createInvitation
  const result = await createInvitation(_prevState, formData)

  // Se deu erro ou não gerou URL, retorna como está
  if (!result || 'error' in result) return result

  const email = (formData.get('email') as string).trim().toLowerCase()
  const role  = formData.get('role') as string

  const admin = createAdminClient()

  // Busca dados do admin que está convidando
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, clinic_id')
    .eq('id', user!.id)
    .single()

  const { data: clinic } = await admin
    .from('clinics')
    .select('name')
    .eq('id', profile!.clinic_id)
    .single()

  const emailResult = await sendInviteEmail({
    to:          email,
    clinicName:  clinic?.name ?? 'Clínica',
    inviterName: profile?.full_name ?? 'Administrador',
    role,
    inviteUrl:   result.url,
  })

  return {
    ...result,
    emailSent: !emailResult.error,
  }
}
