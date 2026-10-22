import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

import { mensagemErro } from '@/lib/errors'
import { limitarPorIp } from '@/lib/api/rate-limit'
// GET /api/cron/hospitalization-dailies
// Vercel Cron (diário) — lança a diária do dia para toda internação ATIVA
// (status observation/ward/icu). ready_for_discharge/discharged não acumulam
// (Regra 4: Alta Médica cessa o acúmulo). Idempotente: 1 diária/dia/internação.

export async function GET(request: NextRequest) {
  const barrado = await limitarPorIp(request, { escopo: 'cron:diarias', limite: 60 })
  if (barrado) return barrado

  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('rpc_accrue_hospitalization_dailies', { p_hospitalization_id: null })

  if (error) {
    return NextResponse.json({ ok: false, error: mensagemErro(error, 'app/api/cron/hospitalization-dailies/route.ts') }, { status: 500 })
  }

  return NextResponse.json({ ok: true, charged: typeof data === 'number' ? data : data ?? 0 })
}
