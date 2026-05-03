import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/keepalive?token=<KEEPALIVE_SECRET>
 *
 * Faz um SELECT simples no Supabase para evitar que o projeto
 * seja pausado automaticamente pelo free tier (pausa após 7 dias sem atividade).
 *
 * Chamado pelo Windows Task Scheduler a cada 5 dias.
 * Protegido por token para evitar abuse.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.KEEPALIVE_SECRET
  const token  = req.nextUrl.searchParams.get('token')

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // SELECT mínimo — apenas confirma que o banco está respondendo
    const { error } = await admin
      .from('profiles')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[keepalive] Supabase error:', error.message)
      return NextResponse.json(
        { ok: false, error: error.message, ts: new Date().toISOString() },
        { status: 502 }
      )
    }

    console.info('[keepalive] Supabase ping OK —', new Date().toISOString())
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (err: any) {
    console.error('[keepalive] Unexpected error:', err?.message ?? err)
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'unknown', ts: new Date().toISOString() },
      { status: 500 }
    )
  }
}
