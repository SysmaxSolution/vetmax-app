/**
 * Endpoint cliente do extrator de cobertura.
 *
 * Existe para permitir AbortSignal REAL via fetch — server actions do Next
 * não cancelam a request HTTP por baixo. Usado pelo hook
 * usePetCoverageSemaforo: cada chamada cria um AbortController; quando o
 * voiceLock suspende, o transcript fica obsoleto ou nova chamada substitui
 * a anterior, a request HTTP é interrompida sem completar o round-trip.
 *
 * Body: { text: string }
 * Response: LlmCoverageResponse | null (sem auth — clínica logada herda RLS)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractCoverageCore } from '@/lib/ai/coverage-extractor'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  let body: { text?: unknown }
  try { body = await req.json() } catch { return NextResponse.json(null, { status: 400 }) }
  const text = typeof body.text === 'string' ? body.text : ''
  if (!text.trim()) return NextResponse.json(null)

  // Propaga o signal do request para o SDK (cancelamento end-to-end).
  const result = await extractCoverageCore(text, { signal: req.signal })
  return NextResponse.json(result)
}
