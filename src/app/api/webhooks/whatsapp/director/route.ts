import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleDirectorCommand } from '@/lib/director-commands'

// POST /api/webhooks/whatsapp/director
// Recebe mensagens da Evolution API para o número do Diretor (P0_ALERT_PHONE).
// Interpreta "SIM [id]" / "NAO [id]" para aprovar/rejeitar fix_plans.
// Usado quando P0_ALERT_INSTANCE é uma instância dedicada (não vinculada a nenhuma clínica).

export async function POST(request: NextRequest) {
  // Autenticação do CHAMADOR. Sem isto, a única barreira era o telefone do
  // remetente — e ele vem DENTRO do corpo, controlado por quem envia. Quem
  // soubesse o número do Diretor (não é segredo) montava um POST se passando
  // por ele e aprovava um fix_plan, que o cron apply-approved-fixes aplica no
  // código com git. Mesmo esquema do webhook da clínica: header apikey.
  const incomingKey = request.headers.get('apikey')
  const expectedKey = process.env.EVOLUTION_API_KEY
  if (expectedKey && incomingKey !== expectedKey) {
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
