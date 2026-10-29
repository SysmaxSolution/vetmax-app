import { verificarAssinaturaSvix, assinarSvix, statusDoEvento, interpretarEvento, textoDoStatus } from '@/lib/email/resend-webhook'

const SECRET = 'whsec_' + Buffer.from('segredo-de-teste-com-32-bytes-ok!!').toString('base64')
const corpo = JSON.stringify({ type: 'email.delivered', created_at: '2026-10-29T12:00:00.000Z', data: { email_id: 'abc-123', to: ['anne_bruna.10@hotmail.com'], subject: 'Convite' } })
const agora = Date.parse('2026-10-29T12:00:05.000Z')
const ts = String(Math.floor(agora / 1000))

describe('webhook do Resend — assinatura Svix', () => {
  it('aceita a assinatura correta e recusa corpo, id ou secret trocados', () => {
    const sig = assinarSvix(SECRET, 'msg_1', ts, corpo)
    const base = { secret: SECRET, msgId: 'msg_1', timestamp: ts, signature: sig, body: corpo, agoraMs: agora }
    expect(verificarAssinaturaSvix(base)).toBe(true)
    expect(verificarAssinaturaSvix({ ...base, body: corpo + ' ' })).toBe(false)
    expect(verificarAssinaturaSvix({ ...base, msgId: 'msg_2' })).toBe(false)
    expect(verificarAssinaturaSvix({ ...base, secret: 'whsec_' + Buffer.from('outro-segredo-qualquer-32-bytes!!').toString('base64') })).toBe(false)
  })

  it('aceita várias assinaturas no cabeçalho (rotação de secret) e recusa timestamp velho', () => {
    const sig = assinarSvix(SECRET, 'msg_1', ts, corpo)
    expect(verificarAssinaturaSvix({ secret: SECRET, msgId: 'msg_1', timestamp: ts, signature: `v1,AAAA ${sig}`, body: corpo, agoraMs: agora })).toBe(true)
    expect(verificarAssinaturaSvix({ secret: SECRET, msgId: 'msg_1', timestamp: ts, signature: sig, body: corpo, agoraMs: agora + 10 * 60 * 1000 })).toBe(false)
    expect(verificarAssinaturaSvix({ secret: SECRET, msgId: null, timestamp: ts, signature: sig, body: corpo, agoraMs: agora })).toBe(false)
  })

  it('traduz o tipo do evento em status e lê o payload com segurança', () => {
    expect(statusDoEvento('email.delivered')).toBe('delivered')
    expect(statusDoEvento('email.bounced')).toBe('bounced')
    expect(statusDoEvento('email.opened')).toBeNull()
    const ev = interpretarEvento(JSON.parse(corpo))!
    expect(ev).toMatchObject({ tipo: 'email.delivered', emailId: 'abc-123', destino: 'anne_bruna.10@hotmail.com', status: 'delivered', abriu: false })
    expect(interpretarEvento({ type: 'contact.created', data: {} })).toBeNull()
    expect(interpretarEvento('lixo')).toBeNull()
    const bounce = interpretarEvento({ type: 'email.bounced', data: { email_id: 'x', bounce: { message: 'Mailbox does not exist' } } })!
    expect(bounce.motivo).toBe('Mailbox does not exist')
  })

  it('tem frase de tela para todo status', () => {
    for (const s of ['queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'suppressed'] as const) expect(textoDoStatus(s)).not.toBe('Sem registro de envio')
    expect(textoDoStatus(null)).toBe('Sem registro de envio')
  })
})
