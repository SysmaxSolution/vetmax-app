import { NextResponse } from 'next/server'
import { zipSync, strToU8 } from 'fflate'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AGENT_BUNDLE } from '@/lib/lab/agent-bundle'
import { clinicFlowFlag } from '@/lib/clinic/flow-gate'

// Gera e devolve o instalador .zip do agente já com o config.json do token.
// Autenticado por sessão (admin da clínica). Uso: /api/lab/installer?agent=<id>
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return NextResponse.json({ error: 'Perfil sem clínica.' }, { status: 403 })
  if (!['admin', 'owner', 'manager'].includes((profile.role as string) ?? '')) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }
  // Gate da rotina (F-3): o instalador entrega o TOKEN do agente — só sai se a
  // clínica ativou o Laboratório.
  if (!(await clinicFlowFlag(createAdminClient(), profile.clinic_id as string, 'usa_laboratorio'))) {
    return NextResponse.json({ error: 'O Laboratório não está ativado para esta clínica.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const agentId = url.searchParams.get('agent')
  if (!agentId) return NextResponse.json({ error: 'agent obrigatório.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: agent } = await admin
    .from('lab_agents').select('id, token, label')
    .eq('id', agentId).eq('clinic_id', profile.clinic_id).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado.' }, { status: 404 })

  // Base do agente = a MESMA URL por onde o admin está acessando (dev ou prod).
  const origin = `${url.protocol}//${url.host}`
  const environment = /localhost|sysvetmax-dev|vercel\.app/.test(url.host) ? 'dev' : 'prod'
  const config = JSON.stringify({ url: origin, environment, token: agent.token, port: 9100 }, null, 2)

  // Monta o zip: arquivos do agente (base64) + config.json do token.
  const entries: Record<string, Uint8Array> = { 'config.json': strToU8(config) }
  for (const [name, b64] of Object.entries(AGENT_BUNDLE)) {
    entries[name] = new Uint8Array(Buffer.from(b64, 'base64'))
  }
  const zipped = zipSync(entries, { level: 0 })

  const safeLabel = String(agent.label ?? 'agente').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40)
  return new NextResponse(Buffer.from(zipped), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="sysvetmax-lab-agent-${safeLabel}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
