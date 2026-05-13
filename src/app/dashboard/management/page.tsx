import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTemplates } from '@/lib/actions/templates'
import { getClinicInvitations } from '@/lib/actions/invitations'
import { getCatalog, seedDefaultCatalog } from '@/lib/actions/catalog'
import { getClinicConfig, getClinicSettingsConfig } from '@/lib/actions/clinic-settings'
import { getRooms } from '@/lib/actions/rooms'
import { getWhatsAppSettings } from '@/lib/actions/whatsapp'
import ManagementWorkspace from '@/components/management/ManagementWorkspace'
import { Suspense } from 'react'
import type { DocumentTemplate } from '@/types'

export const metadata = { title: 'Gestão | SysVetMax' }

export default async function ManagementPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, clinic_id, is_sysmax, clinics(name)')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) redirect('/onboarding')

  if (profile.role !== 'admin') redirect('/dashboard/reception')

  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Minha Clínica'

  const [templatesResult, clinicResult, usersResult, invitationsResult, catalogResult, configResult, roomsResult, settingsConfigResult, whatsAppSettingsResult] = await Promise.all([
    getTemplates(),
    admin
      .from('clinics')
      .select('id, name, cnpj, address, phone, reception_checklist, user_limit, logo_url, active_modules, continuous_flow, flow_config, business_hours, working_days, holiday_work')
      .eq('id', profile.clinic_id)
      .single(),
    admin
      .from('profiles')
      .select('id, full_name, last_name, role, crmv, phone, specialties, nickname, photo_url, address, is_active, room, electronic_signature_url')
      .eq('clinic_id', profile.clinic_id)
      .eq('is_sysmax', false)
      .order('full_name'),
    getClinicInvitations(),
    getCatalog(),
    getClinicConfig(),
    getRooms(),
    getClinicSettingsConfig(),
    getWhatsAppSettings(),
  ])

  const templates: DocumentTemplate[] = 'error' in templatesResult ? [] : templatesResult
  const clinicData = clinicResult.data ?? null
  const users = usersResult.data ?? []
  const invitations = invitationsResult
  const userLimit: number = clinicData?.user_limit ?? 10
  const activeModules: string[] = (clinicData?.active_modules as string[] | null) ?? []
  const initialCatalog = 'error' in catalogResult ? [] : catalogResult
  const initialClinicConfig = 'error' in configResult ? null : configResult
  const initialSettingsConfig = 'error' in settingsConfigResult ? null : settingsConfigResult
  const initialRooms = Array.isArray(roomsResult) ? roomsResult : []
  const initialWhatsAppSettings = whatsAppSettingsResult ?? null

  // Seed defaults se o catálogo estiver vazio
  if (initialCatalog.length === 0 && profile.clinic_id) {
    await seedDefaultCatalog(profile.clinic_id)
    const freshCatalog = await getCatalog()
    initialCatalog.push(...('error' in freshCatalog ? [] : freshCatalog))
  }

  return (
    <Suspense>
      <ManagementWorkspace
        initialTemplates={templates}
        clinicData={clinicData}
        users={users}
        initialInvitations={invitations}
        userLimit={userLimit}
        currentUserId={user.id}
        userEmail={user.email ?? ''}
        userFullName={profile.full_name}
        initialCatalog={initialCatalog}
        initialClinicConfig={initialClinicConfig}
        initialSettingsConfig={initialSettingsConfig}
        initialRooms={initialRooms}
        activeModules={activeModules}
        isSysmax={!!profile.is_sysmax}
        initialWhatsAppSettings={initialWhatsAppSettings}
      />
    </Suspense>
  )
}
