/**
 * Tenant context helpers — use estes em vez de createAdminClient() para ler
 * o clinic_id do usuário logado. O cliente regular (RLS) é suficiente e mais
 * seguro para leitura do próprio perfil.
 *
 * Padrão de migração:
 *   ANTES: const admin = createAdminClient()
 *          const { data } = await admin.from('profiles').select('clinic_id').eq('id', user.id)...
 *   DEPOIS: const ctx = await requireTenantCtx()
 *           if ('error' in ctx) return ctx
 *           const { clinicId } = ctx
 */
import { createClient } from '@/lib/supabase/server'

export type TenantCtx = {
  userId:   string
  clinicId: string
  role:     string
  fullName: string | null
}

/** Retorna null se não autenticado ou sem clínica. */
export async function getTenantCtx(): Promise<TenantCtx | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return null

  return {
    userId:   user.id,
    clinicId: profile.clinic_id as string,
    role:     profile.role     as string,
    fullName: profile.full_name as string | null,
  }
}

/** Retorna { error } em vez de null — para server actions com a convenção { error: string }. */
export async function requireTenantCtx(): Promise<TenantCtx | { error: string }> {
  const ctx = await getTenantCtx()
  if (!ctx) return { error: 'Não autenticado.' }
  return ctx
}
