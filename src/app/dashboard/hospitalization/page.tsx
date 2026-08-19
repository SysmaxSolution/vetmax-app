import { requireModuleAccess } from '@/lib/server/require-module'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHospitalizationsBoard } from '@/lib/actions/hospitalizations'
import HospitalizationKanban from '@/components/hospitalization/HospitalizationKanban'

export const metadata = { title: 'Internação | SysVetMax' }

export default async function HospitalizationPage() {
  const profile = await requireModuleAccess('hospitalization')

  const admin = createAdminClient()
  const [boardResult, subResult] = await Promise.all([
    getHospitalizationsBoard(),
    admin
      .from('tenant_subscriptions')
      .select('plan_name')
      .eq('clinic_id', profile.clinic_id)
      .maybeSingle(),
  ])

  const board = 'error' in boardResult
    ? { observation: [], ward: [], icu: [], ready_for_discharge: [] }
    : boardResult

  const planName = (subResult.data?.plan_name ?? 'free') as string
  const isFreePlan = planName === 'free'

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 animate-enter">
      <HospitalizationKanban
        initialBoard={board}
        clinicId={profile.clinic_id}
        isFreePlan={isFreePlan}
      />
    </main>
  )
}
