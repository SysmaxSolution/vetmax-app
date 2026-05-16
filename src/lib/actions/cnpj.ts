'use server'

import { lookupCnpj, type CnpjResult } from '@/lib/cnpj'

/**
 * Server Action que faz a consulta de CNPJ no servidor (Vercel). Evita o
 * bloqueio do CSP do browser (connect-src) que barrava chamadas client-side
 * a publica.cnpj.ws e brasilapi.com.br.
 */
export async function lookupCnpjAction(rawCnpj: string): Promise<CnpjResult> {
  const result = await lookupCnpj(rawCnpj)
  if (!result.ok && result.reason === 'network') {
    console.warn('[cnpj] network failure for', rawCnpj)
  }
  return result
}
