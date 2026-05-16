'use server'

import { lookupCep, type CepResult } from '@/lib/cep'

/**
 * Server Action que faz a consulta de CEP no servidor (Vercel) em vez do
 * browser. Evita restrições de CSP (connect-src), CORS e firewalls corporativos
 * que bloqueavam as chamadas client-side a ViaCEP/BrasilAPI.
 */
export async function lookupCepAction(rawCep: string): Promise<CepResult> {
  const result = await lookupCep(rawCep)
  // Log mínimo para diagnóstico (aparece nos logs da Vercel)
  if (!result.ok && result.reason === 'network') {
    console.warn('[cep] network failure for', rawCep)
  }
  return result
}
