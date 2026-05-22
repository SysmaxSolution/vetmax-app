/**
 * POST /api/extract-anamnese
 *
 * Endpoint client-callable que envelopa a server action
 * `extractEntitiesFromAnamnese`. Usado pelo `useCanvasHydrator` para
 * re-extrair prescrições estruturadas a partir do texto vivo que o
 * MV está digitando no consultório (Medicamentos / Observações /
 * vet_notes), sem precisar salvar o documento primeiro.
 *
 * Body:  { text: string }
 * Reply: { prescriptions: ParsedPrescription[], confidence, source }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractEntitiesFromAnamneseCore } from '@/lib/ai/anamnese-extractor'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return NextResponse.json({ prescriptions: [], confidence: 'high', source: 'empty' })
    }
    const result = await extractEntitiesFromAnamneseCore(text)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[/api/extract-anamnese] erro:', msg)
    return NextResponse.json(
      { prescriptions: [], confidence: 'low', source: 'ai', error: msg },
      { status: 500 },
    )
  }
}
