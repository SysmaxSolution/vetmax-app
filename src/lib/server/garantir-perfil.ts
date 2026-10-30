// Garante que o cadastro iniciado em /register vire perfil de verdade.
//
// O fluxo normal termina em /auth/callback: a pessoa confirma o e-mail, o
// callback verifica o token e cria o perfil (ou a clínica, quando é cadastro
// novo). Em 29/10/2026 quatro pessoas da Animais ficaram no limbo — o e-mail
// foi confirmado, mas o callback não completou e elas não apareciam em
// Gestão > Usuários nem conseguiam entrar. Por isso a rotina virou módulo:
// o /dashboard chama de novo quando encontra um usuário sem perfil, e o
// cadastro se conclui sozinho no primeiro acesso.

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { User } from '@supabase/supabase-js'
import { insertLegalAcceptanceRaw } from '@/lib/actions/legal'
import { sendFreeSignupAlert } from '@/lib/signup-alert'

/** Cria perfil (e clínica, quando for cadastro novo) a partir de pending_registrations. */
export async function garantirPerfilDoCadastro(user: User): Promise<void> {
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
    email:      user.email ?? null,
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
