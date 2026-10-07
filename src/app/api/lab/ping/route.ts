import { NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/lab/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAgentUpdate } from '@/lib/lab/agent-release'
import { limitarPorIp } from '@/lib/api/rate-limit'

import { limitarPorIp } from '@/lib/api/rate-limit'
// Verificação de pareamento + canal de reconfiguração remota.
// O agente pinga periodicamente (com ?env=dev|prod). Se houver um destino
// pendente definido no painel, devolve `reconfigure` (uma vez) e limpa o pending.
export async function GET(req: Request) {
  const barrado = await limitarPorIp(req, { escopo: 'lab:ping', limite: 240 })
  if (barrado) return barrado

  const auth = await authenticateAgent(req)
  if (!auth) return NextResponse.json({ error: 'Token inválido ou Laboratório não ativado para esta clínica.' }, { status: 401 })
  const admin = createAdminClient()

  const url = new URL(req.url)
  const env = url.searchParams.get('env')
  // O agente informa a versão que está rodando; é o que decide se há atualização.
  const versao = url.searchParams.get('v')?.trim() || null
  const patch: Record<string, unknown> = {}
  if (env) patch.last_env = env
  if (versao) patch.agent_version = versao

  const { data: agent } = await admin
    .from('lab_agents')
    .select('pending_env, pending_url, pending_token')
    .eq('id', auth.agent_id).maybeSingle()

  let reconfigure: { environment: string | null; url: string | null; token: string } | undefined
  if ((agent as any)?.pending_token) {
    reconfigure = {
      environment: (agent as any).pending_env ?? null,
      url: (agent as any).pending_url ?? null,
      token: (agent as any).pending_token as string,
    }
    // one-shot: limpa o pendente após entregar
    patch.pending_env = null; patch.pending_url = null; patch.pending_token = null; patch.pending_set_at = null
  }
  if (Object.keys(patch).length) await admin.from('lab_agents').update(patch).eq('id', auth.agent_id)

  // Atualização do agente: só vem preenchido quando há versão nova PARA ESTE
  // agente (respeita auto_update e pinned_version).
  const update = await resolveAgentUpdate(admin, auth.agent_id, versao)

  const { data: clinic } = await admin.from('clinics').select('name').eq('id', auth.clinic_id).maybeSingle()
  return NextResponse.json({
    ok: true,
    clinic_id: auth.clinic_id,
    clinic_name: clinic?.name ?? null,
    ...(reconfigure ? { reconfigure } : {}),
    ...(update ? { update } : {}),
  })
}
