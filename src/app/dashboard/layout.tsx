import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import DashboardHeader from '@/components/layout/DashboardHeader'
import { WhatsAppGateProvider } from '@/components/providers/WhatsAppGateProvider'
import { ModulesProvider } from '@/components/providers/ModulesProvider'
import { MentorGlobalWrapper } from '@/components/mentor/MentorGlobalWrapper'
import { Suspense } from 'react'
import { UnauthorizedBanner } from '@/components/ui/UnauthorizedBanner'
import { Lock, AlertCircle } from 'lucide-react'
import { getLowStockCount } from '@/lib/actions/stock'
import type { UserClinicInfo } from '@/lib/actions/clinic-switcher'

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
    .select('full_name, role, clinic_id, is_sysmax, clinics(name)')
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

  const [{ data: clinicData }, whatsAppRow, clinicsResult] = await Promise.all([
    admin
      .from('clinics')
      .select('logo_url, active_modules, status')
      .eq('id', profile.clinic_id)
      .single(),
    supabase
      .from('clinic_whatsapp_settings')
      .select('id')
      .eq('clinic_id', profile.clinic_id)
      .eq('is_active', true)
      .maybeSingle(),
    clinicsQuery,
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

  const clinicStatus = (clinicData as any)?.status ?? 'active'
  const clinicConfig = clinicData

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

  const activeModules = (clinicConfig?.active_modules as string[] | null) ?? []

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
        userClinics={isSysmax ? userClinics : (userClinics.length > 1 ? userClinics : undefined)}
        isSysmax={isSysmax}
        clinicStatus={clinicStatus}
      />
      <ModulesProvider modules={activeModules}>
        <WhatsAppGateProvider enabled={whatsAppEnabled}>
          {children}
        </WhatsAppGateProvider>
      </ModulesProvider>
      <MentorGlobalWrapper />
      <Suspense fallback={null}>
        <UnauthorizedBanner />
      </Suspense>
    </section>
  )
}
