import { NextResponse } from 'next/server'
import { authenticateAgent, sampleByBarcode } from '@/lib/lab/agent-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseHL7ORU } from '@/lib/lab/hl7-parser'
import { resolveAnalyte, normKey, type AnalyteMapping } from '@/lib/lab/analyte-resolve'

// Recebimento de resultados: o agente repassa o ORU do aparelho. Casa a amostra
// pelo barcode e grava os analitos em exam_results (rascunho, source='hl7').
// Idempotente por (consultation, source hl7): reimportar substitui o rascunho hl7.
export async function POST(req: Request) {
  const auth = await authenticateAgent(req)
  if (!auth) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }) }

  const hl7 = String(body?.hl7 ?? '')
  const barcode = String(body?.barcode ?? '').trim()
  if (!hl7) return NextResponse.json({ error: 'hl7 obrigatório.' }, { status: 400 })

  const parsed = parseHL7ORU(hl7)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (parsed.analytes.length === 0) return NextResponse.json({ error: 'Sem resultados (OBX).' }, { status: 400 })

  // Barcode: do corpo (o agente extrai do PID) ou tenta do próprio HL7 (PID-3)
  const code = barcode || (hl7.split(/\r\n|\r|\n/).find(s => s.startsWith('PID'))?.split('|')[3] ?? '').split('^')[0].trim()
  if (!code) return NextResponse.json({ error: 'Não foi possível identificar a amostra (barcode/PID).' }, { status: 400 })

  const sample = await sampleByBarcode(auth.clinic_id, code)
  if (!sample) return NextResponse.json({ found: false, barcode: code, error: 'Amostra não encontrada.' }, { status: 404 })

  const admin = createAdminClient()
  // substitui rascunho hl7 anterior desta consulta
  await admin.from('exam_results').delete()
    .eq('clinic_id', auth.clinic_id).eq('consultation_id', sample.consultation_id)
    .eq('status', 'draft').eq('source', 'hl7')

  const { data: maps } = await admin
    .from('lab_analyte_mappings').select('analyte_id, device_code, device_name, lab_agent_id')
    .eq('clinic_id', auth.clinic_id)
  const mappings = (maps ?? []) as AnalyteMapping[]
  const agentId = (auth as any).lab_agent_id ?? (auth as any).agent_id ?? null
  const graphByCode = new Map<string, unknown>()
  for (const g of parsed.graphs) if (g.code) graphByCode.set(normKey(g.code), { kind: g.name, mime: g.mime, encoding: g.encoding, data: g.data })

  const rows = parsed.analytes.map(a => ({
    clinic_id: auth.clinic_id, consultation_id: sample.consultation_id,
    panel: parsed.panel, analyte_code: a.code, analyte_name: a.name,
    analyte_id: resolveAnalyte(a.code, a.name, mappings, agentId),
    value_text: a.value, unit: a.unit, ref_low: a.ref_low, ref_high: a.ref_high,
    ref_text: a.ref_text, flag: a.flag, status: 'draft', source: 'hl7',
    graph_data: a.code && graphByCode.has(normKey(a.code)) ? graphByCode.get(normKey(a.code)) : null,
    raw_hl7: hl7.length <= 20000 ? hl7 : null,
  }))
  const { error } = await admin.from('exam_results').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, consultation_id: sample.consultation_id, count: rows.length })
}
