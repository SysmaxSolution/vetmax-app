import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleDirectorCommand } from '@/lib/director-commands'

// POST /api/webhooks/whatsapp/director
// Recebe mensagens da Evolution API para o número do Diretor (P0_ALERT_PHONE).
// Interpreta "SIM [id]" / "NAO [id]" para aprovar/rejeitar fix_plans.
// Usado quando P0_ALERT_INSTANCE é uma instância dedicada (não vinculada a nenhuma clínica).

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 }) }

  const event = ((body?.event as string) ?? '').toUpperCase().replace(/\./g, '_')
  if (event !== 'MESSAGES_UPSERT') return NextResponse.json({ received: true })

  const data   = body?.data as Record<string, unknown>
  const key    = data?.key  as Record<string, unknown>
  const fromMe = key?.fromMe as boolean | undefined
  if (fromMe) return NextResponse.json({ received: true })

  const jid    = key?.remoteJid as string | undefined
  const sender = jid?.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '') ?? ''

  // Só aceita mensagens do número do Diretor
  const alertPhone = (process.env.P0_ALERT_PHONE ?? '').replace(/\D/g, '')
  if (!alertPhone || !sender.endsWith(alertPhone.slice(-10))) {
    return NextResponse.json({ received: true })
  }

  const msg  = data?.message as Record<string, unknown> | undefined
  const text = (
    (msg?.conversation as string | undefined) ??
    ((msg?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined) ??
    ''
  ).trim()

  if (!text) return NextResponse.json({ received: true })

  const admin = createAdminClient()
  await handleDirectorCommand(text, admin)

  return NextResponse.json({ received: true })
}
