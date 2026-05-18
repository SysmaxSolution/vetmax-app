/**
 * Unit — lookupCnpj (com mock de global.fetch)
 * Fallback publica.cnpj.ws → BrasilAPI v1.
 */

import { lookupCnpj } from '@/lib/cnpj'

function mockResponse(body: any, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

beforeEach(() => {
  ;(global.fetch as unknown) = jest.fn()
})

afterAll(() => {
  delete (global as any).fetch
})

describe('TC-CNPJ-001 → CNPJ válido publica responde', () => {
  test('Retorna razao_social e nome_fantasia', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({
        razao_social: 'PETZ INDUSTRIA LTDA',
        estabelecimento: { nome_fantasia: 'PETZ' },
      })
    )

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.cnpj).toBe('14200166000187')
      expect(r.razao_social).toBe('PETZ INDUSTRIA LTDA')
      expect(r.nome_fantasia).toBe('PETZ')
    }
  })
})

describe('TC-CNPJ-002 → CNPJ com pontos/barras/traços normalizado', () => {
  test('"14.200.166/0001-87" → digits', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({ razao_social: 'X', estabelecimento: { nome_fantasia: 'Y' } })
    )

    const r = await lookupCnpj('14.200.166/0001-87')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.cnpj).toBe('14200166000187')
    }
  })
})

describe('TC-CNPJ-003 → Publica 404 + Brasil 404 → not_found', () => {
  test('Ambos confirmam ausência', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse(null, false, 404))
      .mockResolvedValueOnce(mockResponse(null, false, 404))

    const r = await lookupCnpj('99999999999999')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not_found')
    }
  })
})

describe('TC-CNPJ-004 → Publica 429 + Brasil OK', () => {
  test('Rate limit cai pro fallback', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse(null, false, 429))
      .mockResolvedValueOnce(
        mockResponse({
          razao_social: 'BACKUP CORP',
          nome_fantasia: 'BACKUP',
        })
      )

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.razao_social).toBe('BACKUP CORP')
    }
  })
})

describe('TC-CNPJ-005 → Ambos 5xx → network', () => {
  test('5xx em ambos → reason network', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse(null, false, 503))
      .mockResolvedValueOnce(mockResponse(null, false, 502))

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('network')
    }
  })
})

describe('TC-CNPJ-006 → Menos de 14 dígitos → not_found imediato', () => {
  test('CNPJ curto não chama fetch', async () => {
    const r = await lookupCnpj('123456')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not_found')
    }
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('TC-CNPJ-007 → String vazia → not_found', () => {
  test('"" → not_found', async () => {
    const r = await lookupCnpj('')
    expect(r.ok).toBe(false)
  })
})

describe('TC-CNPJ-008 → null safe', () => {
  test('null → not_found', async () => {
    const r = await lookupCnpj(null as any)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not_found')
    }
  })

  test('undefined → not_found', async () => {
    const r = await lookupCnpj(undefined as any)
    expect(r.ok).toBe(false)
  })
})

describe('TC-CNPJ-009 → Mais de 14 dígitos → not_found', () => {
  test('15 dígitos rejeitado', async () => {
    const r = await lookupCnpj('142001660001870')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not_found')
    }
  })
})

describe('TC-CNPJ-010 → nome_fantasia ausente é aceito (vazio)', () => {
  test('Sem nome_fantasia → string vazia', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({ razao_social: 'EMPRESA SEM FANTASIA', estabelecimento: {} })
    )

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.nome_fantasia).toBe('')
      expect(r.razao_social).toBe('EMPRESA SEM FANTASIA')
    }
  })
})

describe('TC-CNPJ-011 → razao_social ausente em publica → tenta fallback', () => {
  test('Sem razao_social no 1º → tenta BrasilAPI', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse({ detail: 'sem dados' })) // sem razao_social
      .mockResolvedValueOnce(mockResponse({ razao_social: 'FALLBACK SA', nome_fantasia: 'FB' }))

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.razao_social).toBe('FALLBACK SA')
    }
  })
})

describe('TC-CNPJ-012 → Network throw em publica → tenta BrasilAPI', () => {
  test('publica throw + brasil OK', async () => {
    ;(global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(mockResponse({ razao_social: 'OK', nome_fantasia: 'OK' }))

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(true)
  })
})

describe('TC-CNPJ-013 → Ambos throw → network', () => {
  test('Ambos endpoints abortam', async () => {
    ;(global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('network')
    }
  })
})

describe('TC-CNPJ-014 → 13 dígitos → not_found', () => {
  test('13 não é válido', async () => {
    const r = await lookupCnpj('1420016600018')
    expect(r.ok).toBe(false)
  })
})

describe('TC-CNPJ-015 → CNPJ com apenas letras → not_found', () => {
  test('Letras viram digits vazios', async () => {
    const r = await lookupCnpj('abcdefghijklmn')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not_found')
    }
  })
})

describe('TC-CNPJ-016 → Sucesso na primeira tentativa não chama fallback', () => {
  test('Apenas 1 fetch', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({ razao_social: 'X', estabelecimento: { nome_fantasia: 'Y' } })
    )

    await lookupCnpj('14200166000187')
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1)
  })
})

describe('TC-CNPJ-017 → URL publica contém apenas dígitos', () => {
  test('URL bate', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({ razao_social: 'X', estabelecimento: {} })
    )

    await lookupCnpj('14.200.166/0001-87')
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('publica.cnpj.ws')
    expect(url).toContain('14200166000187')
  })
})

describe('TC-CNPJ-018 → Publica 200 mas razao_social vazio → tenta fallback', () => {
  test('Vazio é tratado como ausência', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse({ razao_social: '' }))
      .mockResolvedValueOnce(mockResponse({ razao_social: 'BACKUP', nome_fantasia: 'BK' }))

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.razao_social).toBe('BACKUP')
    }
  })
})

describe('TC-CNPJ-019 → BrasilAPI 200 sem razao_social → network', () => {
  test('Nenhum entrega dados utilizáveis → network', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse({ detail: 'x' })) // sem razao_social
      .mockResolvedValueOnce(mockResponse({ message: 'y' })) // sem razao_social

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('network')
    }
  })
})

describe('TC-CNPJ-020 → Apenas 1 dos provedores confirma 404 → ainda network', () => {
  test('publica 404 + brasil 5xx → network (ambos precisam confirmar)', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse(null, false, 404))
      .mockResolvedValueOnce(mockResponse(null, false, 500))

    const r = await lookupCnpj('14200166000187')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('network')
    }
  })
})
