import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TUTOR_COOKIE } from '@/lib/portal/session'

export const dynamic = 'force-dynamic'

// Logout do tutor — SOMENTE POST. Um GET aqui seria disparado pelo prefetch
// automático de <Link> do Next e derrubaria a sessão só de abrir a home.
export async function POST(req: NextRequest) {
  const token = req.cookies.get(TUTOR_COOKIE)?.value
  if (token) {
    try {
      const admin = createAdminClient()
      await admin.from('tutor_sessions').update({ revoked_at: new Date().toISOString() }).eq('session_token', token)
    } catch { /* best-effort */ }
  }
  const res = NextResponse.redirect(new URL('/portal', req.nextUrl.origin), { status: 303 })
  res.cookies.delete(TUTOR_COOKIE)
  return res
}
