import { isModuleActive, getClinicConfig } from '@/lib/actions/clinic-settings'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MentorClientRoot } from './MentorClientRoot'

export async function MentorGlobalWrapper() {
  const enabled = await isModuleActive('mentor')
  if (!enabled) return null

  const config    = await getClinicConfig()
  const flow      = ('error' in config ? null : config.flow_config) as any
  const idleEnabled = flow?.mentor_idle_enabled ?? true
  const idleSeconds = flow?.mentor_idle_seconds ?? 30

  // PLG: verifica plano para restringir funcionalidades no plano Free
  let isFreePlan = true
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const admin = createAdminClient()
      const { data: profile } = await admin
        .from('profiles')
        .select('clinic_id, is_sysmax')
        .eq('id', user.id)
        .single()
      // SysMax Support nunca tem restrição
      if (profile?.is_sysmax === true) {
        isFreePlan = false
      } else if (profile?.clinic_id) {
        const { data: sub } = await admin
          .from('tenant_subscriptions')
          .select('plan_name')
          .eq('clinic_id', profile.clinic_id)
          .single()
        isFreePlan = (sub?.plan_name ?? 'free') === 'free'
      }
    }
  } catch {
    // fail-safe: mantém free
  }

  return (
    <MentorClientRoot
      idleEnabled={idleEnabled}
      idleSeconds={idleSeconds}
      isFreePlan={isFreePlan}
    />
  )
}
