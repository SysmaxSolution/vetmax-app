import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/keepalive
 * Authorization: Bearer <KEEPALIVE_SECRET>
 *
 * Faz um SELECT simples no Supabase para evitar que o projeto
 * seja pausado automaticamente pelo free tier (pausa após 7 dias sem atividade).
 * Chamado pelo Windows Task Scheduler a cada 5 dias.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.KEEPALIVE_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('profiles')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[keepalive] Supabase error:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[keepalive] Unexpected error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
