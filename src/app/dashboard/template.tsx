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
// Design System 2026 (Fase 1b): template remonta a cada navegação, então é o
// ponto certo para a transição de módulo — 120ms, compositor-only (o keyframe
// termina em transform:none, não interfere em modais/toasts fixed).
function ModuleTransition({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter-fast">{children}</div>
}

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
    return <ModuleTransition>{children}</ModuleTransition>
  }

  // Rota sem module key mapeada (ex.: telas utilitárias) — não bloqueia.
  const moduleKey = moduleKeyFromPath(pathname)
  if (!moduleKey) return <ModuleTransition>{children}</ModuleTransition>

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <ModuleTransition>{children}</ModuleTransition>

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, is_sysmax')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return <ModuleTransition>{children}</ModuleTransition>

  // SysMax Support nunca tem restrição de plano
  if (profile.is_sysmax === true) return <ModuleTransition>{children}</ModuleTransition>

  const allowed = await checkModuleAccess(profile.clinic_id, moduleKey)
  if (!allowed) {
    return <ModuleTransition><PremiumPaywall route={pathname} /></ModuleTransition>
  }

  return <ModuleTransition>{children}</ModuleTransition>
}
