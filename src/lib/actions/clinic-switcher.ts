'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const SYSMAX_EMAIL = 'sysmax@sysmaxsolutions.com'

const ROLE_COOKIE = 'vetmax-role'
const ROLE_COOKIE_OPTIONS = {
  httpOnly:  true,
  sameSite:  'lax'  as const,
  secure:    process.env.NODE_ENV === 'production',
  path:      '/',
  maxAge:    60 * 60 * 24 * 7,
}

export interface UserClinicInfo {
  id:   string
  name: string
  role: string
}

export async function getUserClinics(): Promise<UserClinicInfo[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const isSysmax = user.email?.toLowerCase() === SYSMAX_EMAIL

  // SysMax vê TODAS as clínicas
  if (isSysmax) {
    const { data: allClinics } = await admin
      .from('clinics')
      .select('id, name, status')
      .order('name')

    return (allClinics ?? []).map(c => ({
      id:   c.id,
      name: `${c.name} [${c.status}]`,
      role: 'admin',
    }))
  }

  const { data } = await admin
    .from('user_clinics')
    .select('clinic_id, role, clinics(id, name, status)')
    .eq('user_id', user.id)

  if (!data) return []

  return data
    .filter(uc => {
      const status = (uc.clinics as unknown as { status: string } | null)?.status
      return status === 'active'
    })
    .map(uc => ({
      id:   (uc.clinics as unknown as { id: string }).id,
      name: (uc.clinics as unknown as { name: string }).name,
      role: uc.role,
    }))
}

export async function switchClinic(clinicId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão inválida.' }

  const admin = createAdminClient()
  const isSysmax = user.email?.toLowerCase() === SYSMAX_EMAIL

  if (isSysmax) {
    // SysMax: acessa qualquer clínica como admin
    await admin.from('profiles').upsert({
      id:        user.id,
      clinic_id: clinicId,
      full_name: 'SysMax Suporte',
      role:      'admin',
      is_sysmax: true,
    }, { onConflict: 'id' })

    const cookieStore = await cookies()
    cookieStore.set(ROLE_COOKIE, 'admin', ROLE_COOKIE_OPTIONS)
    redirect('/dashboard')
  }

  // Usuário normal: valida vínculo
  const { data: link } = await admin
    .from('user_clinics')
    .select('role')
    .eq('user_id', user.id)
    .eq('clinic_id', clinicId)
    .single()

  if (!link) return { error: 'Sem acesso a esta clínica.' }

  await admin
    .from('profiles')
    .update({ clinic_id: clinicId, role: link.role })
    .eq('id', user.id)

  const cookieStore = await cookies()
  cookieStore.set(ROLE_COOKIE, link.role, ROLE_COOKIE_OPTIONS)

  redirect('/dashboard')
}
