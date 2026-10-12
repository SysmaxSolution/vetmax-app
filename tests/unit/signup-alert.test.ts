import { sendFreeSignupAlert } from '@/lib/signup-alert'
import { evolutionSendText } from '@/lib/evolution-api-client'

jest.mock('@/lib/evolution-api-client', () => ({
  evolutionSendText: jest.fn(),
}))

const sendText = evolutionSendText as jest.MockedFunction<typeof evolutionSendText>

const ENV_KEYS = [
  'COMMERCIAL_WHATSAPP',
  'P0_ALERT_PHONE',
  'COMMERCIAL_ALERT_INSTANCE',
  'P0_ALERT_INSTANCE',
  'EVOLUTION_INSTANCE',
  'EVOLUTION_API_URL',
  'EVOLUTION_API_KEY',
  'SALES_SIGNUP_WEBHOOK_URL',
  'SALES_SIGNUP_WEBHOOK_SECRET',
] as const

const savedEnv: Record<string, string | undefined> = {}
const fetchMock = jest.fn()
const realFetch = global.fetch

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  sendText.mockReset()
  sendText.mockResolvedValue('msg-id')
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200 })
  global.fetch = fetchMock as unknown as typeof fetch
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  global.fetch = realFetch
  jest.restoreAllMocks()
})

function configureWebhook() {
  process.env.SALES_SIGNUP_WEBHOOK_URL = 'https://painel.test/api/webhooks/signup'
  process.env.SALES_SIGNUP_WEBHOOK_SECRET = 's3cret'
}

function configureWhatsApp(recipients: string) {
  process.env.COMMERCIAL_WHATSAPP = recipients
  process.env.EVOLUTION_API_URL = 'https://evolution.test'
  process.env.EVOLUTION_API_KEY = 'k'
  process.env.COMMERCIAL_ALERT_INSTANCE = 'sysmax-comercial'
}

describe('sendFreeSignupAlert — envio direto por WhatsApp (sem webhook configurado)', () => {
  it('envia para cada número da lista separada por vírgula', async () => {
    configureWhatsApp('5516996095475, 5511939623300')
    await sendFreeSignupAlert({ clinicName: 'Clínica Teste', email: 'a@b.com' })

    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText.mock.calls.map((c) => c[1])).toEqual(['5516996095475', '5511939623300'])
    expect(sendText.mock.calls[0][0]).toMatchObject({ instanceId: 'sysmax-comercial' })
    expect(sendText.mock.calls[0][2]).toContain('Clínica Teste')
    expect(sendText.mock.calls[0][2]).toContain('a@b.com')
  })

  it('falha em um destino não impede os outros e nunca lança', async () => {
    configureWhatsApp('5516996095475,5511939623300')
    sendText.mockRejectedValueOnce(new Error('boom'))

    await expect(sendFreeSignupAlert({ clinicName: 'X' })).resolves.toBeUndefined()
    expect(sendText).toHaveBeenCalledTimes(2)
  })

  it('não loga telefone completo', async () => {
    configureWhatsApp('5516996095475')
    const info = jest.spyOn(console, 'info').mockImplementation(() => {})
    await sendFreeSignupAlert({ clinicName: 'X' })

    const logged = info.mock.calls.flat().join(' ')
    expect(logged).toContain('***5475')
    expect(logged).not.toContain('5516996095475')
  })

  it('sem configuração ignora com warn, sem enviar', async () => {
    await sendFreeSignupAlert({ clinicName: 'X' })
    expect(sendText).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('usa P0_ALERT_PHONE como fallback', async () => {
    process.env.P0_ALERT_PHONE = '5511939623300'
    process.env.EVOLUTION_API_URL = 'https://evolution.test'
    process.env.EVOLUTION_API_KEY = 'k'
    process.env.EVOLUTION_INSTANCE = 'inst'
    await sendFreeSignupAlert({ clinicName: 'X' })
    expect(sendText).toHaveBeenCalledTimes(1)
  })
})

describe('sendFreeSignupAlert — webhook do painel comercial (primeiro)', () => {
  it('faz POST com o secret e omite campos nulos', async () => {
    configureWebhook()

    await sendFreeSignupAlert({
      clinicName: 'Clínica Teste',
      adminName: 'Ana',
      email: 'ana@clinica.com',
      phone: null,
      cnpj: null,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://painel.test/api/webhooks/signup')
    expect(init.method).toBe('POST')
    expect(init.headers['x-sysmax-secret']).toBe('s3cret')
    expect(init.signal).toBeDefined()

    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ clinicName: 'Clínica Teste', adminName: 'Ana', email: 'ana@clinica.com' })
    expect(body).not.toHaveProperty('phone')
    expect(body).not.toHaveProperty('cnpj')
    expect(typeof body.createdAt).toBe('string')
  })

  it('webhook 2xx → NÃO envia WhatsApp direto (sem alerta duplicado)', async () => {
    configureWebhook()
    configureWhatsApp('5516996095475,5511939623300')

    await sendFreeSignupAlert({ clinicName: 'X' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('webhook com URL mas sem secret conta como não configurado → envio direto', async () => {
    process.env.SALES_SIGNUP_WEBHOOK_URL = 'https://painel.test/api/webhooks/signup'
    configureWhatsApp('5516996095475')

    await sendFreeSignupAlert({ clinicName: 'X' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledTimes(1)
  })

  it('sem as envs do webhook não chama fetch e envia direto', async () => {
    configureWhatsApp('5516996095475,5511939623300')

    await sendFreeSignupAlert({ clinicName: 'X' })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledTimes(2)
  })

  it('webhook 500 → fallback: envia WhatsApp direto para todos os destinos', async () => {
    configureWebhook()
    configureWhatsApp('5516996095475,5511939623300')
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    await sendFreeSignupAlert({ clinicName: 'Clínica Fallback' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText.mock.calls.map((c) => c[1])).toEqual(['5516996095475', '5511939623300'])
    expect(sendText.mock.calls[0][2]).toContain('Clínica Fallback')
  })

  it('webhook 401 (segredo errado) → fallback direto', async () => {
    configureWebhook()
    configureWhatsApp('5516996095475')
    fetchMock.mockResolvedValue({ ok: false, status: 401 })

    await sendFreeSignupAlert({ clinicName: 'X' })

    expect(sendText).toHaveBeenCalledTimes(1)
  })

  it('timeout do webhook → fallback direto', async () => {
    configureWebhook()
    configureWhatsApp('5516996095475')
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))

    await expect(sendFreeSignupAlert({ clinicName: 'X' })).resolves.toBeUndefined()

    expect(sendText).toHaveBeenCalledTimes(1)
  })

  it('erro de rede no webhook → fallback direto', async () => {
    configureWebhook()
    configureWhatsApp('5516996095475')
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    await expect(sendFreeSignupAlert({ clinicName: 'X' })).resolves.toBeUndefined()

    expect(sendText).toHaveBeenCalledTimes(1)
  })

  it('fallback usa P0_ALERT_PHONE quando COMMERCIAL_WHATSAPP não está definido', async () => {
    configureWebhook()
    process.env.P0_ALERT_PHONE = '5511939623300'
    process.env.EVOLUTION_API_URL = 'https://evolution.test'
    process.env.EVOLUTION_API_KEY = 'k'
    process.env.EVOLUTION_INSTANCE = 'inst'
    fetchMock.mockResolvedValue({ ok: false, status: 502 })

    await sendFreeSignupAlert({ clinicName: 'X' })

    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText.mock.calls[0][1]).toBe('5511939623300')
  })

  it('webhook falhou e um destino do fallback também falha: o outro é enviado e nunca lança', async () => {
    configureWebhook()
    configureWhatsApp('5516996095475,5511939623300')
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    sendText.mockRejectedValueOnce(new Error('evolution fora'))

    await expect(sendFreeSignupAlert({ clinicName: 'X' })).resolves.toBeUndefined()

    expect(sendText).toHaveBeenCalledTimes(2)
  })

  it('webhook e WhatsApp falhando juntos nunca lançam', async () => {
    configureWebhook()
    configureWhatsApp('5516996095475')
    fetchMock.mockRejectedValue(new Error('rede'))
    sendText.mockRejectedValue(new Error('evolution fora'))

    await expect(sendFreeSignupAlert({ clinicName: 'X' })).resolves.toBeUndefined()
  })

  it('logs do fallback não vazam telefone completo nem o segredo', async () => {
    configureWebhook()
    configureWhatsApp('5516996095475')
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const info = jest.spyOn(console, 'info').mockImplementation(() => {})
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})

    await sendFreeSignupAlert({ clinicName: 'X' })

    const logged = [...info.mock.calls, ...error.mock.calls].flat().join(' ')
    expect(logged).toContain('***5475')
    expect(logged).not.toContain('5516996095475')
    expect(logged).not.toContain('s3cret')
  })
})
