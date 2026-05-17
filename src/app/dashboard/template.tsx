import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isRouteAllowed } from '@/config/access-matrix'
import PremiumPaywall from '@/components/paywall/PremiumPaywall'
import type { PlanName, BusinessType } from '@/types'

// template.tsx re-executa em CADA navegação dentro de /dashboard (diferente de layout.tsx).
// É o lugar correto para enforcement de plano sem flash-of-content.
export default async function DashboardTemplate({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? '/dashboard'

  // Rotas sempre liberadas — sem checagem de plano
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/profile') ||
    pathname.startsWith('/dashboard/settings')
  ) {
    return <>{children}</>
  }

  // Busca plano e tipo de negócio da clínica atual
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <>{children}</>

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, is_sysmax')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return <>{children}</>

  // SysMax Support nunca tem restrição de plano
  if (profile.is_sysmax === true) return <>{children}</>

  const [subResult, clinicResult] = await Promise.all([
    admin
      .from('tenant_subscriptions')
      .select('plan_name')
      .eq('clinic_id', profile.clinic_id)
      .single(),
    admin
      .from('clinics')
      .select('business_type')
      .eq('id', profile.clinic_id)
      .single(),
  ])

  const plan         = (subResult.data?.plan_name    ?? 'free')       as PlanName
  const businessType = (clinicResult.data?.business_type ?? 'vet_clinic') as BusinessType

  if (!isRouteAllowed(pathname, plan, businessType)) {
    return <PremiumPaywall route={pathname} />
  }

  return <>{children}</>
}
