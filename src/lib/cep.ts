// Busca de CEP com fallback duplo: ViaCEP → BrasilAPI.
// ViaCEP é rápido mas frequentemente cai (mixed content, CORS transitório, downtime).
// BrasilAPI v2 usa múltiplas fontes (Correios, OpenCEP, ViaCEP) e é mais resiliente.

export type CepResult = {
  ok: true
  cep: string
  street: string
  neighborhood: string
  city: string
  state: string
} | {
  ok: false
  /** 'not_found' = todos os provedores responderam mas o CEP não existe.
   *  'network'   = falha de rede / timeout / CORS — tentar de novo pode resolver. */
  reason: 'not_found' | 'network'
}

const TIMEOUT_MS = 4000

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

type ViaCepResponse = {
  erro?: boolean
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  cep?: string
}

type BrasilApiResponse = {
  cep?: string
  street?: string
  neighborhood?: string
  city?: string
  state?: string
}

export async function lookupCep(rawCep: string): Promise<CepResult> {
  const digits = (rawCep ?? '').replace(/\D/g, '')
  if (digits.length !== 8) return { ok: false, reason: 'not_found' }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  try {
    // 1ª tentativa: ViaCEP
    const v = await fetchJson<ViaCepResponse>(`https://viacep.com.br/ws/${digits}/json/`, ctrl.signal)
    if (v && !v.erro && v.localidade) {
      return {
        ok: true,
        cep: digits,
        street: v.logradouro ?? '',
        neighborhood: v.bairro ?? '',
        city: v.localidade ?? '',
        state: v.uf ?? '',
      }
    }

    // 2ª tentativa: BrasilAPI v2 (multi-fonte)
    const b = await fetchJson<BrasilApiResponse>(
      `https://brasilapi.com.br/api/cep/v2/${digits}`,
      ctrl.signal,
    )
    if (b && b.city) {
      return {
        ok: true,
        cep: digits,
        street: b.street ?? '',
        neighborhood: b.neighborhood ?? '',
        city: b.city ?? '',
        state: b.state ?? '',
      }
    }

    // ViaCEP retornou erro:true → CEP confirmado como inexistente.
    if (v && v.erro) return { ok: false, reason: 'not_found' }

    // Ambos falharam por motivos não-confirmatórios → tratamos como rede.
    return { ok: false, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }
}
