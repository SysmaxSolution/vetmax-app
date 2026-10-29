// Busca de CNPJ com fallback duplo: publica.cnpj.ws → BrasilAPI v1.
// publica.cnpj.ws expõe dados completos da Receita; BrasilAPI cobre quando
// a primeira está fora do ar ou retorna rate limit (429).

export type CnpjResult = {
  ok: true
  cnpj: string
  razao_social: string
  nome_fantasia: string
  // dados complementares (podem vir vazios dependendo do provedor)
  address?: string
  phone?:   string
  email?:   string
} | {
  ok: false
  reason: 'not_found' | 'network'
}

const TIMEOUT_MS = 5000

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<{ data: T; status: number } | null> {
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return { data: null as unknown as T, status: res.status }
    return { data: (await res.json()) as T, status: res.status }
  } catch {
    return null
  }
}

type PublicaCnpjResponse = {
  razao_social?: string
  estabelecimento?: {
    nome_fantasia?: string
    tipo_logradouro?: string; logradouro?: string; numero?: string; bairro?: string
    cidade?: { nome?: string }; estado?: { sigla?: string }
    ddd1?: string; telefone1?: string; email?: string
  }
  detail?: string
}

type BrasilApiCnpjResponse = {
  razao_social?: string
  nome_fantasia?: string
  logradouro?: string; numero?: string; bairro?: string; municipio?: string; uf?: string
  ddd_telefone_1?: string; email?: string
  message?: string
}

const joinAddr = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(', ')

export async function lookupCnpj(rawCnpj: string): Promise<CnpjResult> {
  const digits = (rawCnpj ?? '').replace(/\D/g, '')
  if (digits.length !== 14) return { ok: false, reason: 'not_found' }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  try {
    // 1ª tentativa: publica.cnpj.ws (gratuita, dados completos)
    const p = await fetchJson<PublicaCnpjResponse>(`https://publica.cnpj.ws/cnpj/${digits}`, ctrl.signal)
    if (p && p.status === 200 && p.data?.razao_social) {
      const e = p.data.estabelecimento ?? {}
      return {
        ok: true,
        cnpj: digits,
        razao_social: p.data.razao_social ?? '',
        nome_fantasia: e.nome_fantasia ?? '',
        address: joinAddr([
          [e.tipo_logradouro, e.logradouro].filter(Boolean).join(' '),
          e.numero, e.bairro,
          e.cidade?.nome ? `${e.cidade.nome}/${e.estado?.sigla ?? ''}` : null,
        ]),
        phone: e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : '',
        email: e.email ?? '',
      }
    }
    // 404 confirmado → CNPJ realmente não existe
    const publicaNotFound = p?.status === 404

    // 2ª tentativa: BrasilAPI v1
    const b = await fetchJson<BrasilApiCnpjResponse>(
      `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
      ctrl.signal,
    )
    if (b && b.status === 200 && b.data?.razao_social) {
      const d = b.data
      return {
        ok: true,
        cnpj: digits,
        razao_social: d.razao_social ?? '',
        nome_fantasia: d.nome_fantasia ?? '',
        address: joinAddr([
          d.logradouro, d.numero, d.bairro,
          d.municipio ? `${d.municipio}/${d.uf ?? ''}` : null,
        ]),
        phone: d.ddd_telefone_1 ?? '',
        email: d.email ?? '',
      }
    }
    const brasilNotFound = b?.status === 404

    // Ambos provedores confirmam que não existe
    if (publicaNotFound && brasilNotFound) return { ok: false, reason: 'not_found' }

    // Caso contrário, classificamos como falha temporária (rate limit, 5xx, abort)
    return { ok: false, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }
}
