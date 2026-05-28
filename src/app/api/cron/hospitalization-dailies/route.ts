import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/cron/hospitalization-dailies
// Vercel Cron (diário) — lança a diária do dia para toda internação ATIVA
// (status observation/ward/icu). ready_for_discharge/discharged não acumulam
// (Regra 4: Alta Médica cessa o acúmulo). Idempotente: 1 diária/dia/internação.

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('rpc_accrue_hospitalization_dailies', { p_hospitalization_id: null })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, charged: typeof data === 'number' ? data : data ?? 0 })
}
