import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PARTNER_COOKIE } from '@/lib/portal/partner-session'

export const dynamic = 'force-dynamic'

// Logout do parceiro — só POST (prefetch de <Link> é GET; não pode derrubar sessão).
export async function POST(req: NextRequest) {
  const token = req.cookies.get(PARTNER_COOKIE)?.value
  if (token) {
    try {
      const admin = createAdminClient()
      await admin.from('partner_clinic_sessions').update({ revoked_at: new Date().toISOString() }).eq('session_token', token)
    } catch { /* best-effort */ }
  }
  const res = NextResponse.redirect(new URL('/parceiro', req.nextUrl.origin), { status: 303 })
  res.cookies.delete(PARTNER_COOKIE)
  return res
}
