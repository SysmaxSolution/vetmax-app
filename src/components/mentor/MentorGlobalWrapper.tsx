import { isModuleActive } from '@/lib/actions/clinic-settings'
import { MentorClientRoot } from './MentorClientRoot'

/**
 * Server Component — verifica se o módulo 'mentor' está ativo para a clínica
 * e renderiza o sistema conversacional do Mentor condicionalmente.
 * Inserido no dashboard/layout.tsx para cobrir todas as telas autenticadas.
 */
export async function MentorGlobalWrapper() {
  const enabled = await isModuleActive('mentor')
  if (!enabled) return null
  return <MentorClientRoot />
}
