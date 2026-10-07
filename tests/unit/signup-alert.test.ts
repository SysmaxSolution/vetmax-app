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

function configureWhatsApp(recipients: string) {
  process.env.COMMERCIAL_WHATSAPP = recipients
  process.env.EVOLUTION_API_URL = 'https://evolution.test'
  process.env.EVOLUTION_API_KEY = 'k'
  process.env.COMMERCIAL_ALERT_INSTANCE = 'sysmax-comercial'
}

describe('sendFreeSignupAlert — WhatsApp', () => {
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

describe('sendFreeSignupAlert — webhook do painel comercial', () => {
  it('faz POST com o secret e omite campos nulos', async () => {
    process.env.SALES_SIGNUP_WEBHOOK_URL = 'https://painel.test/api/webhooks/signup'
    process.env.SALES_SIGNUP_WEBHOOK_SECRET = 's3cret'

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

  it('sem as envs não chama fetch', async () => {
    await sendFreeSignupAlert({ clinicName: 'X' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('erro de rede ou resposta não-ok nunca lança', async () => {
    process.env.SALES_SIGNUP_WEBHOOK_URL = 'https://painel.test/api/webhooks/signup'
    process.env.SALES_SIGNUP_WEBHOOK_SECRET = 's3cret'

    fetchMock.mockRejectedValueOnce(new Error('timeout'))
    await expect(sendFreeSignupAlert({ clinicName: 'X' })).resolves.toBeUndefined()

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(sendFreeSignupAlert({ clinicName: 'X' })).resolves.toBeUndefined()
  })

  it('falha do WhatsApp não impede o webhook', async () => {
    configureWhatsApp('5516996095475')
    process.env.SALES_SIGNUP_WEBHOOK_URL = 'https://painel.test/api/webhooks/signup'
    process.env.SALES_SIGNUP_WEBHOOK_SECRET = 's3cret'
    sendText.mockRejectedValue(new Error('evolution fora'))

    await sendFreeSignupAlert({ clinicName: 'X' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
