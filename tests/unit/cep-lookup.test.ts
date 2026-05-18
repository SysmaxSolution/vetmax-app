/**
 * Unit — lookupCep (com mock de global.fetch)
 * Fallback ViaCEP → BrasilAPI v2.
 */

import { lookupCep } from '@/lib/cep'

const VIACEP_URL = 'viacep.com.br'
const BRASILAPI_URL = 'brasilapi.com.br'

// Helper para construir respostas mockadas
function mockResponse(body: any, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

beforeEach(() => {
  // Reset entre testes — cada test define seu próprio mock
  ;(global.fetch as unknown) = jest.fn()
})

afterAll(() => {
  // Limpa o mock após todos os testes
  delete (global as any).fetch
})

describe('TC-CEP-001 → CEP válido ViaCEP responde', () => {
  test('Retorna dados do ViaCEP', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({
        logradouro: 'Av Paulista',
        bairro: 'Bela Vista',
        localidade: 'São Paulo',
        uf: 'SP',
        cep: '01310-100',
      })
    )

    const r = await lookupCep('01310100')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.city).toBe('São Paulo')
      expect(r.state).toBe('SP')
      expect(r.street).toBe('Av Paulista')
      expect(r.cep).toBe('01310100')
    }
  })
})

describe('TC-CEP-002 → CEP com hífen → digits-only', () => {
  test('"01310-100" é normalizado', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({
        logradouro: 'X',
        bairro: 'Y',
        localidade: 'Z',
        uf: 'SP',
      })
    )

    const r = await lookupCep('01310-100')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.cep).toBe('01310100')
    }
  })
})

describe('TC-CEP-003 → ViaCEP retorna erro:true → fallback BrasilAPI', () => {
  test('Tenta BrasilAPI quando ViaCEP nega', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse({ erro: true }))
      .mockResolvedValueOnce(
        mockResponse({
          street: 'Rua Alt',
          neighborhood: 'Bairro Alt',
          city: 'Cidade Alt',
          state: 'RJ',
        })
      )

    const r = await lookupCep('99999999')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.city).toBe('Cidade Alt')
      expect(r.state).toBe('RJ')
    }
  })
})

describe('TC-CEP-004 → ViaCEP HTTP 500 → fallback BrasilAPI', () => {
  test('Erro 500 cai pro fallback', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse(null, false, 500))
      .mockResolvedValueOnce(
        mockResponse({
          street: 'OK',
          neighborhood: 'OK',
          city: 'Rio de Janeiro',
          state: 'RJ',
        })
      )

    const r = await lookupCep('20040020')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.city).toBe('Rio de Janeiro')
    }
  })
})

describe('TC-CEP-005 → Ambos falham por rede → reason network', () => {
  test('ViaCEP throw + BrasilAPI throw', async () => {
    ;(global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('net err 1'))
      .mockRejectedValueOnce(new Error('net err 2'))

    const r = await lookupCep('01310100')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('network')
    }
  })
})

describe('TC-CEP-006 → ViaCEP erro confirmado + BrasilAPI 404 → not_found', () => {
  test('Ambos confirmam ausência', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse({ erro: true }))
      .mockResolvedValueOnce(mockResponse(null, false, 404))

    const r = await lookupCep('00000000')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not_found')
    }
  })
})

describe('TC-CEP-007 → Menos de 8 dígitos → not_found imediato', () => {
  test('CEP curto não chama fetch', async () => {
    const r = await lookupCep('1234567')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not_found')
    }
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('TC-CEP-008 → String vazia → not_found imediato', () => {
  test('vazio → not_found', async () => {
    const r = await lookupCep('')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not_found')
    }
  })
})

describe('TC-CEP-009 → null/undefined safe', () => {
  test('null não quebra', async () => {
    const r = await lookupCep(null as any)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('not_found')
    }
  })

  test('undefined não quebra', async () => {
    const r = await lookupCep(undefined as any)
    expect(r.ok).toBe(false)
  })
})

describe('TC-CEP-010 → ViaCEP sem localidade → fallback BrasilAPI', () => {
  test('localidade ausente é considerado falha', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse({ logradouro: 'X' })) // sem localidade
      .mockResolvedValueOnce(mockResponse({ city: 'Curitiba', state: 'PR' }))

    const r = await lookupCep('80000000')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.city).toBe('Curitiba')
    }
  })
})

describe('TC-CEP-011 → BrasilAPI sem city → network', () => {
  test('Nenhum provedor entrega city → network', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse({ logradouro: 'X' })) // sem localidade
      .mockResolvedValueOnce(mockResponse({ street: 'Y' })) // sem city

    const r = await lookupCep('80000000')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('network')
    }
  })
})

describe('TC-CEP-012 → CEP com 9 dígitos → not_found', () => {
  test('Mais que 8 dígitos rejeita', async () => {
    const r = await lookupCep('012345678')
    expect(r.ok).toBe(false)
  })
})

describe('TC-CEP-013 → ViaCEP campos opcionais vazios', () => {
  test('logradouro/bairro vazios mas city ok → still ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({
        logradouro: '',
        bairro: '',
        localidade: 'Cidade X',
        uf: 'SP',
      })
    )

    const r = await lookupCep('01310100')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.city).toBe('Cidade X')
      expect(r.street).toBe('')
      expect(r.neighborhood).toBe('')
    }
  })
})

describe('TC-CEP-014 → JSON malformado retorna null no fetchJson', () => {
  test('json() throw → null → fallback ou network', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new Error('bad json') },
      } as any)
      .mockResolvedValueOnce(mockResponse({ city: 'Y', state: 'SP' }))

    const r = await lookupCep('01310100')
    expect(r.ok).toBe(true)
  })
})

describe('TC-CEP-015 → CEP com letras é normalizado', () => {
  test('"abc01310100xyz" → 01310100', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({ logradouro: 'X', bairro: 'Y', localidade: 'Z', uf: 'SP' })
    )

    const r = await lookupCep('abc01310100xyz')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.cep).toBe('01310100')
    }
  })
})

describe('TC-CEP-016 → Apenas ViaCEP é chamado quando responde primeiro', () => {
  test('Sucesso ViaCEP → 1 chamada', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({ logradouro: 'X', bairro: 'Y', localidade: 'SP', uf: 'SP' })
    )

    await lookupCep('01310100')
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1)
  })
})

describe('TC-CEP-017 → URL ViaCEP usa digits only', () => {
  test('URL contém apenas dígitos', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({ logradouro: 'X', bairro: 'Y', localidade: 'Z', uf: 'SP' })
    )

    await lookupCep('01310-100')
    const call = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(call).toContain(VIACEP_URL)
    expect(call).toContain('01310100')
    expect(call).not.toContain('-')
  })
})

describe('TC-CEP-018 → Quando ViaCEP falha por rede, BrasilAPI é chamado', () => {
  test('2 calls (ViaCEP throw + BrasilAPI sucesso)', async () => {
    ;(global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce(mockResponse({ city: 'Recife', state: 'PE' }))

    await lookupCep('50000000')
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(2)
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain(BRASILAPI_URL)
  })
})

describe('TC-CEP-019 → reason network quando provedor B retorna não-ok sem 404', () => {
  test('ViaCEP throw + BrasilAPI 500 → network', async () => {
    ;(global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce(mockResponse(null, false, 500))

    const r = await lookupCep('99999999')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('network')
    }
  })
})

describe('TC-CEP-020 → Resposta com state mas sem outros campos opcionais', () => {
  test('Apenas city e state → ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      mockResponse({ localidade: 'Salvador', uf: 'BA' })
    )

    const r = await lookupCep('40000000')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.city).toBe('Salvador')
      expect(r.street).toBe('')
      expect(r.neighborhood).toBe('')
    }
  })
})
