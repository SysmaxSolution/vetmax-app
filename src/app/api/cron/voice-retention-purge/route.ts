import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

import { mensagemErro } from '@/lib/errors'
import { limitarPorIp } from '@/lib/api/rate-limit'
// GET /api/cron/voice-retention-purge
// Vercel Cron (diário) — LGPD Art. 16: anonimiza (NULL no texto cru) os eventos
// de voz já processados após 180 dias, via rpc_purge_voice_correction_events.
// Decisão PO 2026-06-26 (retenção 180d). Ver migration 0411.

export async function GET(request: NextRequest) {
  const barrado = await limitarPorIp(request, { escopo: 'cron:purga', limite: 60 })
  if (barrado) return barrado

  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('rpc_purge_voice_correction_events', { p_retention_days: 180 })

  if (error) {
    return NextResponse.json({ ok: false, error: mensagemErro(error, 'app/api/cron/voice-retention-purge/route.ts') }, { status: 500 })
  }

  return NextResponse.json({ ok: true, purged: typeof data === 'number' ? data : data ?? 0 })
}
