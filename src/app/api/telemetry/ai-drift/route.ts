/**
 * Telemetria de drift do modelo de IA do Semáforo de Cobertura.
 *
 * Disparado quando o LLM retorna:
 *  - JSON inválido (não-parseável)
 *  - JSON que falha o LlmResponseSchema (categoria fora do enum, confidence
 *    fora de [0,1], shape errado)
 *  - Categoria inventada
 *
 * Salva em error_logs com module='ai-coverage-drift' severity='warn'.
 * Permite revisar o System Prompt se o Haiku começar a alucinar em massa.
 *
 * Body: { input_snippet, output_raw, model, timestamp? }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface DriftBody {
  input_snippet?: string
  output_raw?:    string
  model?:         string
  timestamp?:     string
  reason?:        string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  let body: DriftBody
  try { body = await req.json() as DriftBody } catch { return NextResponse.json({ ok: false }, { status: 400 }) }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .maybeSingle()

  // Trunca para não estourar a coluna em casos extremos
  const snippet = (body.input_snippet ?? '').slice(0, 800)
  const output  = (body.output_raw    ?? '').slice(0, 800)
  const model   = (body.model         ?? '').slice(0, 80)
  const reason  = (body.reason        ?? '').slice(0, 80)

  await admin
    .from('error_logs')
    .insert({
      clinic_id:     profile?.clinic_id ?? null,
      user_id:       user.id,
      path:          '/api/telemetry/ai-drift',
      error_message: reason || 'LLM coverage extractor returned invalid/unparseable JSON',
      stack_trace:   null,
      user_journey:  {
        input_snippet: snippet,
        output_raw:    output,
        model,
        timestamp:     body.timestamp ?? new Date().toISOString(),
      },
      severity:      'warn',
      module:        'ai-coverage-drift',
      source:        'client',
    })

  return NextResponse.json({ ok: true })
}
