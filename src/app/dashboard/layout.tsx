import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import DashboardHeader from '@/components/layout/DashboardHeader'
import { WhatsAppGateProvider } from '@/components/providers/WhatsAppGateProvider'
import { ModulesProvider } from '@/components/providers/ModulesProvider'
import { ClinicConfigProvider } from '@/components/providers/ClinicConfigProvider'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { MentorGlobalWrapper } from '@/components/mentor/MentorGlobalWrapper'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { SysmaxFooter } from '@/components/ui/SysmaxFooter'
import { getModuleFromPath } from '@/lib/module-theme'
import { Lock, AlertCircle } from 'lucide-react'
import { getLowStockCount } from '@/lib/actions/stock'
import type { UserClinicInfo } from '@/lib/actions/clinic-switcher'
import OnboardingWizard from '@/components/onboarding/OnboardingWizard'
import { FREE_ROUTES } from '@/config/access-matrix'
import type { PlanName, BusinessType } from '@/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Usa admin client para profile (evita bloqueio RLS para superadmin SysMax)
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, clinic_id, is_sysmax, is_in_surgery, ui_preferences, clinics(name)')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')

  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Minha Clínica'

  // Verificar status da clínica + WhatsApp habilitado + estoque baixo + multi-clínica
  const isSysmax = profile.is_sysmax === true

  // Busca clínicas do usuário: SysMax vê todas, normais veem via user_clinics
  const clinicsQuery = isSysmax
    ? admin.from('clinics').select('id, name, status').order('name')
    : admin.from('user_clinics').select('clinic_id, role, clinics(id, name, status)').eq('user_id', user.id)

  const [{ data: clinicData }, whatsAppRow, clinicsResult, petCountResult, subResult] = await Promise.all([
    admin
      .from('clinics')
      .select('logo_url, active_modules, status, ai_transcription_mode, business_type, ui_preferences')
      .eq('id', profile.clinic_id)
      .single(),
    supabase
      .from('clinic_whatsapp_settings')
      .select('id')
      .eq('clinic_id', profile.clinic_id)
      .eq('is_active', true)
      .maybeSingle(),
    clinicsQuery,
    admin
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', profile.clinic_id),
    admin
      .from('tenant_subscriptions')
      .select('plan_name')
      .eq('clinic_id', profile.clinic_id)
      .single(),
  ])

  let userClinics: UserClinicInfo[] = []
  if (isSysmax) {
    userClinics = ((clinicsResult.data ?? []) as { id: string; name: string; status: string }[]).map(c => ({
      id: c.id, name: `${c.name} [${c.status}]`, role: 'admin',
    }))
  } else {
    userClinics = ((clinicsResult.data ?? []) as { clinic_id: string; role: string; clinics: unknown }[])
      .filter(uc => (uc.clinics as any)?.status === 'active')
      .map(uc => ({
        id:   (uc.clinics as any).id,
        name: (uc.clinics as any).name,
        role: uc.role,
      }))
  }

  const lowStockCount = profile.role === 'admin'
    ? await getLowStockCount(profile.clinic_id)
    : 0

  const whatsAppEnabled = !!whatsAppRow.data

  const clinicStatus   = (clinicData as any)?.status ?? 'active'
  const clinicConfig   = clinicData
  const planName       = ((subResult as any)?.data?.plan_name ?? 'free') as PlanName
  const businessType   = ((clinicData as any)?.business_type ?? 'vet_clinic') as BusinessType
  const allowedRoutes  = FREE_ROUTES[businessType] ?? FREE_ROUTES.vet_clinic

  // Bloqueio de clínica em análise (SysMax nunca é bloqueado)
  if (clinicStatus === 'pending' && !isSysmax) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-6 flex justify-center">
            <div className="bg-amber-100 rounded-full p-4">
              <Lock className="w-12 h-12 text-amber-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Clínica em Análise
          </h1>
          <p className="text-gray-600 mb-6">
            Sua clínica está em processo de análise e validação pela Sysmax Solutions.
            Por favor, entre em contato com nossa equipe para obter mais informações sobre o status do seu cadastro.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            <a href="mailto:suporte@sysmax.com.br" className="font-semibold hover:underline">
              suporte@sysmax.com.br
            </a>
          </div>
        </div>
      </div>
    )
  }

  const clinicModules = (clinicConfig?.active_modules as string[] | null) ?? []

  // RBAC por usuário — lê de user_module_access (tabela populada pelo modal
  // "Gestão > Usuários > Permissões"). Colunas: module_name, enabled.
  // Era lida da tabela user_module_permissions, que está vazia → o filtro
  // nunca acatava o que o admin marcava. Bug crítico reportado em 2026-05-22.
  const { data: userModuleRows } = await admin
    .from('user_module_access')
    .select('module_name, enabled')
    .eq('clinic_id', profile.clinic_id)
    .eq('user_id', user.id)

  // DEFAULT RESTRITIVO (decisão de PO 2026-05-22): admin e SysMax veem todos
  // os módulos ativos da clínica. Demais usuários só veem o que tem row
  // enabled=true em user_module_access. Row ausente OU enabled=false = não
  // aparece no menu.
  const isAdminOrSysmax = profile.role === 'admin' || isSysmax
  const userEnabled = new Set(
    (userModuleRows ?? [])
      .filter((r: any) => r.enabled === true)
      .map((r: any) => r.module_name as string)
  )
  const userDisabled = new Set(
    (userModuleRows ?? [])
      .filter((r: any) => r.enabled === false)
      .map((r: any) => r.module_name as string)
  )
  const activeModules = isAdminOrSysmax
    ? clinicModules
    : clinicModules.filter(m => userEnabled.has(m))

  // Esconder-em-vez-de-bloquear: se o usuário acessa diretamente a URL de um
  // módulo que o admin desativou para ele, redireciona silenciosamente para o
  // primeiro módulo permitido — sem mostrar "Acesso negado".
  // O pathname vem do header injetado pelo proxy.ts em cada request.
  if (profile.role !== 'admin' && !isSysmax) {
    const hdrs = await headers()
    const pathname = hdrs.get('x-pathname') ?? ''
    const requestedModule = getModuleFromPath(pathname)
    if (requestedModule && userDisabled.has(requestedModule)) {
      // Escolhe primeiro módulo disponível na ordem natural do menu
      const fallback = activeModules[0] ?? 'patients'
      redirect(`/dashboard/${fallback}`)
    }
  }

  // Conta todas as conversas ativas (bot + human) para badge no módulo WhatsApp
  const whatsappHandoffCount = activeModules.includes('whatsapp_intelligent')
    ? ((await admin
        .from('whatsapp_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', profile.clinic_id)
        .neq('status', 'closed')
      ).count ?? 0)
    : 0

  return (
    <section className="min-h-screen bg-slate-50">
      <DashboardHeader
        userName={profile.full_name}
        clinicName={clinicName}
        clinicId={profile.clinic_id}
        userRole={profile.role as any}
        logoUrl={clinicConfig?.logo_url ?? null}
        activeModules={activeModules.length > 0 ? activeModules : null}
        lowStockCount={lowStockCount}
        whatsappHandoffCount={whatsappHandoffCount}
        userClinics={isSysmax ? userClinics : (userClinics.length > 1 ? userClinics : undefined)}
        isSysmax={isSysmax}
        clinicStatus={clinicStatus}
        isSurgeryMode={!!(profile as any).is_in_surgery}
        planName={planName}
        allowedRoutes={allowedRoutes}
      />
      <ThemeProvider initialPreferences={(clinicData as any)?.ui_preferences ?? null}>
        <ClinicConfigProvider aiTranscriptionMode={(clinicData as any)?.ai_transcription_mode ?? 'ai_assisted'}>
          <ModulesProvider modules={activeModules}>
            <WhatsAppGateProvider enabled={whatsAppEnabled}>
              {children}
            </WhatsAppGateProvider>
          </ModulesProvider>
        </ClinicConfigProvider>
      </ThemeProvider>
      {!isSysmax && (
        <OnboardingWizard
          initialHasLogo={!!(clinicData as any)?.logo_url}
          initialHasPets={(petCountResult.count ?? 0) > 0}
          clinicId={profile.clinic_id}
          userRole={profile.role}
        />
      )}
      <MentorGlobalWrapper />
      {/* UnauthorizedBanner removido: por decisão de UX (2026-05-22), URLs
          inacessíveis redirecionam silenciosamente para a home do usuário —
          sem aviso de "Acesso negado". Os links sem permissão já não aparecem
          no menu. Mantemos a Suspense vazia para preservar a estrutura. */}
      <Suspense fallback={null}>{null}</Suspense>
      <SysmaxFooter />
    </section>
  )
}
