import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeSecretEqual } from '@/lib/webhook-auth'
import { handleDirectorCommand } from '@/lib/director-commands'

// POST /api/webhooks/whatsapp/director
// Recebe mensagens da Evolution API para o número do Diretor (P0_ALERT_PHONE).
// Interpreta "SIM [id]" / "NAO [id]" para aprovar/rejeitar fix_plans.
// Usado quando P0_ALERT_INSTANCE é uma instância dedicada (não vinculada a nenhuma clínica).

export async function POST(request: NextRequest) {
  // Valida que a requisição vem do servidor Evolution API (apikey no header).
  // FAIL-CLOSED: telefone (remoteJid) é controlável pelo atacante e NÃO é credencial —
  // sem esta barreira, um POST forjado aprovava fix_plans e disparava a aplicação
  // autônoma de código (apply-approved-fixes).
  if (!safeSecretEqual(request.headers.get('apikey'), process.env.EVOLUTION_API_KEY)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  // Só aceita mensagens do número do Diretor (compara últimos 11 dígitos: DDD + 9 dígitos BR)
  const alertPhone = (process.env.P0_ALERT_PHONE ?? '').replace(/\D/g, '')
  const tail11Auth   = alertPhone.slice(-11)
  const tail11Sender = sender.slice(-11)
  if (!alertPhone || tail11Auth.length < 11 || tail11Auth !== tail11Sender) {
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
  await handleDirectorCommand(text, sender, admin)

  return NextResponse.json({ received: true })
}
