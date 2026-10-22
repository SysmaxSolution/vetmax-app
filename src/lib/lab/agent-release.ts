// Qual versão do agente-ponte ESTE agente deveria estar rodando.
//
// Regras, nesta ordem:
//   1. `auto_update = false` → nunca atualiza (clínica em atualização manual);
//   2. `pinned_version` → segura numa versão específica (útil para voltar uma
//      clínica sem mexer nas outras);
//   3. senão, a release marcada como corrente.
//
// Devolve null quando não há nada a fazer — inclusive quando o agente já está
// na versão alvo.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AgentUpdate {
  version: string
  sha256:  string
}

export async function resolveAgentUpdate(
  admin: SupabaseClient,
  agentId: string,
  versaoAtual: string | null,
): Promise<AgentUpdate | null> {
  const { data: agent } = await admin
    .from('lab_agents')
    .select('auto_update, pinned_version')
    .eq('id', agentId).maybeSingle()
  if (!agent || (agent as { auto_update?: boolean }).auto_update === false) return null

  const pinned = (agent as { pinned_version?: string | null }).pinned_version ?? null

  const q = admin.from('lab_agent_releases').select('version, sha256')
  const { data: release } = pinned
    ? await q.eq('version', pinned).maybeSingle()
    : await q.eq('is_current', true).maybeSingle()

  if (!release) return null
  const alvo = release as { version: string; sha256: string }
  if (versaoAtual && versaoAtual === alvo.version) return null
  return { version: alvo.version, sha256: alvo.sha256 }
}
