import { isModuleActive, getClinicConfig } from '@/lib/actions/clinic-settings'
import { MentorClientRoot } from './MentorClientRoot'

export async function MentorGlobalWrapper() {
  const enabled = await isModuleActive('mentor')
  if (!enabled) return null

  const config    = await getClinicConfig()
  const flow      = ('error' in config ? null : config.flow_config) as any
  const idleEnabled = flow?.mentor_idle_enabled ?? true
  const idleSeconds = flow?.mentor_idle_seconds ?? 30

  return <MentorClientRoot idleEnabled={idleEnabled} idleSeconds={idleSeconds} />
}
