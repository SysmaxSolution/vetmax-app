/**
 * Constantes e helpers PUROS do provedor Focus NFe (Faturamento Fase 3).
 * Módulo SEM 'use server' — exports síncronos (const/função) não podem viver
 * num arquivo de server actions (o Next exige que todo export de 'use server'
 * seja async). Estes valores são usados por src/lib/actions/nfse.ts.
 */

// Endpoints Focus NFe. Auth é HTTP Basic com o token como usuário e senha vazia.
export const FOCUS_NFE_ENDPOINTS = {
  sandbox:    'https://homologacao.focusnfe.com.br',
  production: 'https://api.focusnfe.com.br',
} as const

/** Caminho do recurso NFS-e: POST p/ emitir, GET p/ consultar (ref na query). */
export function focusNfsePath(ref: string): string {
  return `/v2/nfse?ref=${encodeURIComponent(ref)}`
}
