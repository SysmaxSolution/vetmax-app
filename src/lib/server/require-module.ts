// Server-only helper para checar acesso a um módulo via user_module_access
// e redirecionar para /dashboard quando o admin bloqueou explicitamente.
//
// Substitui os gates hardcoded por role que existiam em cada page.tsx de módulo
// (ex.: `if (!['admin','vet'].includes(profile.role)) redirect('/dashboard')`).
//
// Decisão de design (2026-05-22): visibilidade e acesso a módulos seguem
// EXCLUSIVAMENTE user_module_access — sem fallback de role.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Verifica se o usuário tem acesso ao módulo informado.
 * - Sem sessão → redireciona para /login
 * - Sem perfil → redireciona para /onboarding
 * - Módulo `enabled=false` em user_module_access → redireciona para /dashboard
 * - Default permissivo (sem row OU enabled=true) → permite
 *
 * Retorna o `profile` (id, clinic_id, role) para a página usar.
 */
export async function requireModuleAccess(moduleName: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, clinic_id, role, is_sysmax, full_name, clinics(name)')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) redirect('/onboarding')

  // SysMax (suporte interno) e admin têm acesso a tudo da clínica.
  if (profile.is_sysmax || profile.role === 'admin') return profile

  // DEFAULT RESTRITIVO (decisão de PO 2026-05-22): para não-admin, só permite
  // se admin marcou explicitamente enabled=true em user_module_access. Sem row
  // ou enabled=false → bloqueia.
  const { data: row } = await admin
    .from('user_module_access')
    .select('enabled')
    .eq('user_id', user.id)
    .eq('module_name', moduleName)
    .maybeSingle()

  if (!row || row.enabled !== true) redirect('/dashboard')

  // Adicionalmente: respeita se o módulo está habilitado na CLÍNICA (active_modules)
  const { data: clinic } = await admin
    .from('clinics')
    .select('active_modules')
    .eq('id', profile.clinic_id)
    .single()
  const activeModules = (clinic?.active_modules as string[] | null) ?? []
  if (activeModules.length > 0 && !activeModules.includes(moduleName)) {
    redirect('/dashboard')
  }

  return profile
}
