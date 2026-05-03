import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canEnableModule } from '@/lib/module-governance'

/**
 * Module Governance Middleware
 * Protects routes based on:
 *  - User role (admin/owner only)
 *  - Module enabled in clinic.active_modules
 *  - Master key validation (if MODULE_GOVERNANCE_STRICT=true)
 *
 * Usage: Apply to /api/modules/[*], /dashboard/[*]/settings, etc.
 */

export async function moduleProtectionMiddleware(
  request: NextRequest,
  moduleName: string
): Promise<NextResponse | null> {
  // 1. Extract user from request (e.g., from cookie, auth header)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  // 2. Fetch user profile + clinic
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 403 })
  }

  // 3. Check role
  if (!['admin', 'owner'].includes(profile.role)) {
    return NextResponse.json({ error: 'Acesso negado: apenas admins' }, { status: 403 })
  }

  // 4. Fetch clinic active_modules
  const { data: clinic } = await supabase
    .from('clinics')
    .select('active_modules')
    .eq('id', profile.clinic_id)
    .single()

  if (!clinic) {
    return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 })
  }

  const activeModules = Array.isArray(clinic.active_modules) ? clinic.active_modules : []

  if (!activeModules.includes(moduleName)) {
    return NextResponse.json(
      { error: `Módulo "${moduleName}" não habilitado` },
      { status: 403 }
    )
  }

  // 5. Check governance rules
  const masterKey = request.headers.get('X-Module-Master-Key') || undefined
  const result = canEnableModule(profile.role, moduleName, {
    masterKey,
    requireVerification: process.env.MODULE_GOVERNANCE_STRICT === 'true',
  })

  if (!result.allowed) {
    return NextResponse.json({ error: result.reason || 'Acesso negado' }, { status: 403 })
  }

  // 6. Access granted: return null to allow request to proceed
  return null
}

/**
 * Helper to check module access in Server Actions.
 * Returns { allowed: true } or { allowed: false, reason: string }
 */

export async function checkModuleAccess(moduleName: string): Promise<
  { allowed: true } | { allowed: false; reason: string }
> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { allowed: false, reason: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return { allowed: false, reason: 'Perfil não encontrado' }

  const { data: clinic } = await supabase
    .from('clinics')
    .select('active_modules')
    .eq('id', profile.clinic_id)
    .single()

  if (!clinic) return { allowed: false, reason: 'Clínica não encontrada' }

  const activeModules = Array.isArray(clinic.active_modules) ? clinic.active_modules : []

  if (!activeModules.includes(moduleName)) {
    return { allowed: false, reason: `Módulo "${moduleName}" não habilitado` }
  }

  if (!['admin', 'owner'].includes(profile.role)) {
    return { allowed: false, reason: 'Apenas admins podem acessar' }
  }

  return { allowed: true }
}
