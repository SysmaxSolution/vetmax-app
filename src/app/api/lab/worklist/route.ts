import { NextResponse } from 'next/server'
import { authenticateAgent, sampleByBarcode } from '@/lib/lab/agent-auth'

// Worklist: o agente recebe o QRY do aparelho (barcode do tubo) e pergunta aqui
// quais exames dosar. Retorna a amostra + exames (o agente monta o DSR).
export async function POST(req: Request) {
  const auth = await authenticateAgent(req)
  if (!auth) return NextResponse.json({ error: 'Token inválido ou Laboratório não ativado para esta clínica.' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }) }
  const barcode = String(body?.barcode ?? '').trim()
  if (!barcode) return NextResponse.json({ error: 'barcode obrigatório.' }, { status: 400 })

  const sample = await sampleByBarcode(auth.clinic_id, barcode)
  if (!sample) return NextResponse.json({ found: false, barcode }, { status: 404 })
  return NextResponse.json({ found: true, ...sample })
}
