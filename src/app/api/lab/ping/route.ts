import { NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/lab/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'

// Verificação de pareamento + canal de reconfiguração remota.
// O agente pinga periodicamente (com ?env=dev|prod). Se houver um destino
// pendente definido no painel, devolve `reconfigure` (uma vez) e limpa o pending.
export async function GET(req: Request) {
  const auth = await authenticateAgent(req)
  if (!auth) return NextResponse.json({ error: 'Token inválido ou Laboratório não ativado para esta clínica.' }, { status: 401 })
  const admin = createAdminClient()

  const url = new URL(req.url)
  const env = url.searchParams.get('env')
  const patch: Record<string, unknown> = {}
  if (env) patch.last_env = env

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

  const { data: clinic } = await admin.from('clinics').select('name').eq('id', auth.clinic_id).maybeSingle()
  return NextResponse.json({ ok: true, clinic_id: auth.clinic_id, clinic_name: clinic?.name ?? null, ...(reconfigure ? { reconfigure } : {}) })
}
