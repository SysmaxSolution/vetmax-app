import { NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/lab/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAgentUpdate } from '@/lib/lab/agent-release'
import { limitarPorIp } from '@/lib/api/rate-limit'

// Canal de auto-atualização do agente-ponte.
//
// GET  → devolve o código da versão pedida (o agente confere o SHA-256 antes
//        de trocar o arquivo que roda).
// POST → o agente conta como terminou: confirmado ou falhou.
//
// Autenticado pelo MESMO Bearer token do agente — quem não está pareado e com
// o Laboratório ativado na clínica não chega aqui (ver authenticateAgent).

export async function GET(req: Request) {
  const barrado = await limitarPorIp(req, { escopo: 'lab:update', limite: 30 })
  if (barrado) return barrado

  const auth = await authenticateAgent(req)
  if (!auth) return NextResponse.json({ error: 'Token inválido ou Laboratório não ativado para esta clínica.' }, { status: 401 })

  const version = new URL(req.url).searchParams.get('version')?.trim()
  if (!version) return NextResponse.json({ error: 'version obrigatório.' }, { status: 400 })

  const admin = createAdminClient()
  const alvo = await resolveAgentUpdate(admin, auth.agent_id, null)
  // Só entrega a versão que ESTE agente deveria estar rodando. Evita que um
  // token válido sirva de porta para baixar qualquer release antiga.
  if (!alvo || alvo.version !== version) {
    return NextResponse.json({ error: 'Versão não disponível para este agente.' }, { status: 404 })
  }

  const { data } = await admin
    .from('lab_agent_releases')
    .select('version, sha256, source')
    .eq('version', version).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Versão não encontrada.' }, { status: 404 })

  return NextResponse.json({ version: data.version, sha256: data.sha256, source: data.source })
}

export async function POST(req: Request) {
  const auth = await authenticateAgent(req)
  if (!auth) return NextResponse.json({ error: 'Token inválido ou Laboratório não ativado para esta clínica.' }, { status: 401 })

  let body: { version?: unknown; ok?: unknown; error?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }) }

  const ok = body?.ok === true
  const admin = createAdminClient()
  await admin.from('lab_agents').update({
    agent_version:     String(body?.version ?? '').slice(0, 40) || null,
    last_update_at:    new Date().toISOString(),
    last_update_error: ok ? null : String(body?.error ?? 'falha não descrita').slice(0, 500),
  }).eq('id', auth.agent_id)

  return NextResponse.json({ ok: true })
}
