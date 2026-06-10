import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ManagementNav from '@/components/management/ManagementNav'

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isSysmax       = false
  let planName       = 'specialized'
  let showAssinatura = false

  if (user) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('is_sysmax, clinic_id')
      .eq('id', user.id)
      .single()
    isSysmax = !!profile?.is_sysmax

    if (profile?.clinic_id) {
      const [subResult, clinicResult] = await Promise.all([
        admin
          .from('tenant_subscriptions')
          .select('plan_name')
          .eq('clinic_id', profile.clinic_id)
          .maybeSingle(),
        admin
          .from('clinics')
          .select('flow_config')
          .eq('id', profile.clinic_id)
          .single(),
      ])
      if (!isSysmax) planName = subResult.data?.plan_name ?? 'free'
      // SaaS Fase 1 — rollout restrito (Vet Teste); SysMax sempre vê.
      const flow = (clinicResult.data?.flow_config ?? {}) as { subscription_plans_ui?: boolean }
      showAssinatura = isSysmax || flow.subscription_plans_ui === true
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Gestão da Clínica</h1>
        <p className="mt-0.5 text-sm text-slate-500">Templates, configurações e usuários</p>
      </div>
      <Suspense>
        <ManagementNav showMonitoramento={isSysmax} planName={planName} showAssinatura={showAssinatura} />
      </Suspense>
      {children}
    </div>
  )
}
