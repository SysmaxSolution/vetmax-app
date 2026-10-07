import { NextResponse } from 'next/server'
import { authenticateAgent, sampleByBarcode } from '@/lib/lab/agent-auth'
import { readLabRequest } from '@/lib/lab/request-body'

import { limitarPorIp } from '@/lib/api/rate-limit'
// Worklist: o agente recebe o QRY do aparelho (barcode do tubo) e pergunta aqui
// quais exames dosar. Retorna a amostra + exames (o agente monta o DSR).
export async function POST(req: Request) {
  const barrado = await limitarPorIp(req, { escopo: 'lab:worklist', limite: 120 })
  if (barrado) return barrado

  const auth = await authenticateAgent(req)
  if (!auth) return NextResponse.json({ error: 'Token inválido ou Laboratório não ativado para esta clínica.' }, { status: 401 })
  // Mesmo leitor da rota de resultados: gzip quando vier, JSON puro quando não.
  const read = await readLabRequest<{ barcode?: unknown }>(req)
  if ('error' in read) return NextResponse.json({ error: read.error }, { status: 400 })
  const body = read.body
  const barcode = String(body?.barcode ?? '').trim()
  if (!barcode) return NextResponse.json({ error: 'barcode obrigatório.' }, { status: 400 })

  const sample = await sampleByBarcode(auth.clinic_id, barcode)
  if (!sample) return NextResponse.json({ found: false, barcode }, { status: 404 })
  return NextResponse.json({ found: true, ...sample })
}
