import https from 'node:https'
import { EventEmitter } from 'node:events'
import { requisicaoMtls, type CredenciaisSicoob } from '@/lib/integrations/sicoob-mtls'

/**
 * O gateway do Sicoob recusa requisição sem `Content-Length` com
 * `500 {"moreInformation":"Invalid request type"}` — mensagem que não ajuda
 * nem um pouco a achar a causa. Custou uma tarde.
 *
 * Como o cabeçalho é montado dentro do transporte, o único jeito de garantir
 * que ele continua lá é interceptando o que vai para `https.request`.
 */
function capturarRequisicao() {
  const capturado: { opcoes?: Record<string, unknown>; corpo: string } = { corpo: '' }

  jest.spyOn(https, 'request').mockImplementation(((opcoes: Record<string, unknown>, cb: (r: unknown) => void) => {
    capturado.opcoes = opcoes
    const req = new EventEmitter() as EventEmitter & {
      write: (c: string) => void; end: () => void
    }
    req.write = (c: string) => { capturado.corpo += c }
    req.end = () => {
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number; setEncoding: (e: string) => void
      }
      res.statusCode = 200
      res.setEncoding = () => {}
      // O callback espera o 'end' para resolver.
      setImmediate(() => { cb(res); res.emit('data', '{}'); res.emit('end') })
    }
    return req
  }) as unknown as typeof https.request)

  return capturado
}

// Um .pfx de mentira: `carregarPfx` só confere o tamanho, e aqui o que
// interessa são os cabeçalhos, não o TLS.
const cred: CredenciaisSicoob = {
  environment: 'production',
  client_id: 'abc',
  pfx: Buffer.alloc(800, 1),
  passphrase: 'x',
}

afterEach(() => { jest.restoreAllMocks() })

describe('requisicaoMtls — cabeçalhos', () => {
  it('põe Content-Length em requisição com corpo', async () => {
    const cap = capturarRequisicao()
    const corpo = JSON.stringify({ valor: { original: '10.00' } })

    await requisicaoMtls('https://api.sicoob.com.br/pix/api/v2/cob', cred, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corpo,
    })

    const headers = cap.opcoes?.headers as Record<string, string>
    expect(headers['Content-Length']).toBe(String(Buffer.byteLength(corpo)))
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('mede o corpo em BYTES, não em caracteres', async () => {
    const cap = capturarRequisicao()
    // Acentos ocupam 2 bytes em UTF-8: contar caracteres daria menos, e o
    // gateway cortaria o corpo no meio.
    const corpo = JSON.stringify({ descricao: 'Consulta veterinária — Açaí' })

    await requisicaoMtls('https://api.sicoob.com.br/x', cred, { method: 'POST', body: corpo })

    const headers = cap.opcoes?.headers as Record<string, string>
    expect(Number(headers['Content-Length'])).toBe(Buffer.byteLength(corpo))
    expect(Number(headers['Content-Length'])).toBeGreaterThan(corpo.length)
  })

  it('não inventa Content-Length em requisição sem corpo', async () => {
    const cap = capturarRequisicao()
    await requisicaoMtls('https://api.sicoob.com.br/x', cred, { method: 'GET' })
    const headers = cap.opcoes?.headers as Record<string, string>
    expect(headers['Content-Length']).toBeUndefined()
  })

  it('respeita o Content-Length que quem chama já definiu', async () => {
    const cap = capturarRequisicao()
    await requisicaoMtls('https://api.sicoob.com.br/x', cred, {
      method: 'POST',
      headers: { 'Content-Length': '999' },
      body: 'abc',
    })
    const headers = cap.opcoes?.headers as Record<string, string>
    expect(headers['Content-Length']).toBe('999')
  })

  it('corpo vazio ainda declara zero — é diferente de não ter corpo', async () => {
    const cap = capturarRequisicao()
    await requisicaoMtls('https://api.sicoob.com.br/x', cred, { method: 'POST', body: '' })
    const headers = cap.opcoes?.headers as Record<string, string>
    expect(headers['Content-Length']).toBe('0')
  })
})
