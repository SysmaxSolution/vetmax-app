import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTemplates } from '@/lib/actions/templates'
import { getClinicInvitations } from '@/lib/actions/invitations'
import { getClinicConfig, getClinicSettingsConfig } from '@/lib/actions/clinic-settings'
import { getRooms } from '@/lib/actions/rooms'
import ManagementWorkspace from '@/components/management/ManagementWorkspace'
import { Suspense } from 'react'
import type { DocumentTemplate } from '@/types'

import { urlAssinatura, type PerfilComAssinatura } from '@/lib/storage/assinatura'
export const metadata = { title: 'Gestão | SysVetMax' }

const COLUNAS_USUARIO = 'id, full_name, last_name, role, crmv, mapa_code, phone, specialties, nickname, photo_url, address, is_active, room, electronic_signature_url, electronic_signature_path, appointment_interval_minutes'

// Quem pertence à clínica = quem tem vínculo em user_clinics OU está com ela
// como clínica ativa. Filtrar só por profiles.clinic_id escondia quem tem
// acesso a mais de uma clínica assim que a pessoa trocava para a outra.
async function listarUsuariosDaClinica(admin: ReturnType<typeof createAdminClient>, clinicId: string) {
  const [{ data: porAtiva }, { data: vinculos }] = await Promise.all([
    admin.from('profiles').select(COLUNAS_USUARIO).eq('clinic_id', clinicId).eq('is_sysmax', false),
    admin.from('user_clinics').select('user_id').eq('clinic_id', clinicId),
  ])
  const vistos = new Set((porAtiva ?? []).map(u => u.id))
  const faltam = (vinculos ?? []).map(v => v.user_id).filter(id => !vistos.has(id))
  const { data: porVinculo } = faltam.length
    ? await admin.from('profiles').select(COLUNAS_USUARIO).in('id', faltam).eq('is_sysmax', false)
    : { data: [] as NonNullable<typeof porAtiva> }
  const todos = [...(porAtiva ?? []), ...(porVinculo ?? [])]
  todos.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR'))
  return { data: todos }
}

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

  const [templatesResult, clinicResult, usersResult, invitationsResult, configResult, roomsResult, settingsConfigResult, subResult, contractedResult, catalogResult, planConfigResult] = await Promise.all([
    getTemplates(),
    admin
      .from('clinics')
      .select('id, name, cnpj, address, phone, reception_checklist, user_limit, logo_url, active_modules, continuous_flow, flow_config, business_hours, working_days, holiday_work, business_type, layout_version')
      .eq('id', profile.clinic_id)
      .single(),
    listarUsuariosDaClinica(admin, profile.clinic_id),
    getClinicInvitations(),
    getClinicConfig(),
    getRooms(),
    getClinicSettingsConfig(),
    admin
      .from('tenant_subscriptions')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .maybeSingle(),
    admin
      .from('clinic_contracted_modules')
      .select('module_key')
      .eq('clinic_id', profile.clinic_id)
      .eq('is_active', true),
    admin
      .from('subscription_module_catalog')
      .select('*')
      .order('sort_order'),
    admin
      .from('subscription_plan_config')
      .select('starter_base_price, premium_base_price, enterprise_base_price, annual_discount_percent')
      .eq('id', 1)
      .single(),
  ])

  const templates: DocumentTemplate[] = 'error' in templatesResult ? [] : templatesResult
  const clinicData = clinicResult.data ?? null
  // Bucket privado desde a 0499: a tela mostra a assinatura por URL assinada de
  // vida curta, nao mais por URL publica permanente.
  const users = await Promise.all((usersResult.data ?? []).map(async u => ({
    ...u,
    electronic_signature_url: await urlAssinatura(u as PerfilComAssinatura),
  })))
  const invitations = invitationsResult
  const userLimit: number = clinicData?.user_limit ?? 10
  const activeModules: string[] = (clinicData?.active_modules as string[] | null) ?? []
  const initialClinicConfig = 'error' in configResult ? null : configResult
  const initialSettingsConfig = 'error' in settingsConfigResult ? null : settingsConfigResult
  const initialRooms = Array.isArray(roomsResult) ? roomsResult : []
  const planName: string = (subResult as any)?.data?.plan_name ?? 'free'

  // SaaS Fase 1 — dados da aba Assinatura + gate de rollout (Vet Teste/SysMax)
  const flowConfigRaw = ((clinicData?.flow_config ?? {}) as { subscription_plans_ui?: boolean })
  const showAssinatura = !!profile.is_sysmax || flowConfigRaw.subscription_plans_ui === true
  const subscriptionOverview = {
    subscription: (subResult as any)?.data ?? null,
    contractedKeys: ((contractedResult as any)?.data ?? []).map((r: any) => r.module_key as string),
    catalog: (((catalogResult as any)?.data ?? []) as any[]).map(r => ({
      ...r,
      monthly_price: Number(r.monthly_price),
    })),
    config: {
      starter_base_price: Number((planConfigResult as any)?.data?.starter_base_price ?? 189),
      premium_base_price: Number((planConfigResult as any)?.data?.premium_base_price ?? 359.9),
      enterprise_base_price: Number((planConfigResult as any)?.data?.enterprise_base_price ?? 1299),
      annual_discount_percent: Number((planConfigResult as any)?.data?.annual_discount_percent ?? 20),
    },
    businessType: ((clinicData?.business_type ?? 'vet_clinic') as 'vet_clinic' | 'pet_aesthetics'),
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
        initialClinicConfig={initialClinicConfig}
        initialSettingsConfig={initialSettingsConfig}
        initialRooms={initialRooms}
        activeModules={activeModules}
        isSysmax={!!profile.is_sysmax}
        planName={planName}
        subscriptionOverview={subscriptionOverview}
        showAssinatura={showAssinatura}
      />
    </Suspense>
  )
}
