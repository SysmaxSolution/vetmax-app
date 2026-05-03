import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const ROLE_COOKIE = 'vetmax-role'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })

  const cookieStore = await cookies()
  cookieStore.delete(ROLE_COOKIE)

  return NextResponse.json({ ok: true })
}
