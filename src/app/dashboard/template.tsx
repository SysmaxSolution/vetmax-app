import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkModuleAccess } from '@/lib/subscription/gatekeeper'
import { moduleKeyFromPath } from '@/config/path-modules'
import PremiumPaywall from '@/components/paywall/PremiumPaywall'

// template.tsx re-executa em CADA navegação dentro de /dashboard (diferente de layout.tsx).
// É o lugar correto para enforcement de plano sem flash-of-content.
//
// SaaS Fase 1: o gate por rota (isRouteAllowed/FREE_ROUTES) foi substituído
// pelo gatekeeper centralizado (clinic_contracted_modules + catálogo +
// FREE_MODULES). O backfill 0365 garante que nenhuma clínica existente perde
// acesso. NÃO mover esta checagem para o proxy (edge) — custo por request.
export default async function DashboardTemplate({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? '/dashboard'

  // Rotas sempre liberadas — sem checagem de plano. /dashboard/management
  // permanece acessível (o lock granular é por aba, dentro da Gestão).
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/profile') ||
    pathname.startsWith('/dashboard/settings') ||
    pathname.startsWith('/dashboard/management')
  ) {
    return <>{children}</>
  }

  // Rota sem module key mapeada (ex.: telas utilitárias) — não bloqueia.
  const moduleKey = moduleKeyFromPath(pathname)
  if (!moduleKey) return <>{children}</>

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

  const allowed = await checkModuleAccess(profile.clinic_id, moduleKey)
  if (!allowed) {
    return <PremiumPaywall route={pathname} />
  }

  return <>{children}</>
}
