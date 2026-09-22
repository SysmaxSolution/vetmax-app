import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { settleBoletoPaid } from '@/lib/boleto/settle'
import { logBoletoEvent } from '@/lib/boleto/events'

// Webhook de Cobrança Bancária Sicoob — notificação de pagamento (baixa automática).
// Registrado em produção (POST /webhooks na API Sicoob) apontando para esta URL
// com ?key=<SICOOB_WEBHOOK_SECRET>. Ao receber o pagamento, marca o boleto como
// pago e baixa o título vinculado com o detalhamento do banco nas observações.
export async function POST(req: Request) {
  const secret = process.env.SICOOB_WEBHOOK_SECRET
  const key = new URL(req.url).searchParams.get('key')
  if (!secret || key !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  // O payload do Sicoob varia; extraímos de forma tolerante.
  const r = body?.resultado ?? body ?? {}
  const nossoNumero = String(r.nossoNumero ?? r.nosso_numero ?? body?.nossoNumero ?? '').trim()
  const situacao = String(r.situacaoBoleto ?? r.situacao ?? body?.situacao ?? '').toLowerCase()
  const paidAmount = Number(r.valorPago ?? r.valor_pago ?? r.valorRecebido ?? 0) || null
  const paidAt = (r.dataPagamento ?? r.data_pagamento ?? r.dataRecebimento ?? null) as string | null

  if (!nossoNumero) return NextResponse.json({ error: 'nossoNumero ausente' }, { status: 400 })
  if (situacao && !/pag|liquid|baixa por pagamento/.test(situacao)) {
    return NextResponse.json({ ok: true, ignored: `situação ${situacao}` })
  }

  const admin = createAdminClient()
  const { data: b } = await admin.from('clinic_boletos').select('id, clinic_id').eq('nosso_numero', nossoNumero).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!b) return NextResponse.json({ ok: true, ignored: 'boleto não encontrado' })

  // registra o retorno cru do banco na trilha
  await logBoletoEvent(admin, {
    clinicId: (b as any).clinic_id, boletoId: (b as any).id, eventType: 'retorno_banco', actorType: 'bank', actorName: 'Banco Sicoob',
    detail: `Retorno recebido do banco — situação ${situacao || 'pagamento'}`, situacao: 'pago', payload: r,
  })

  const res = await settleBoletoPaid({ clinicId: (b as any).clinic_id, nossoNumero }, {
    paidAt, paidAmount, bankDetail: `Detalhe Sicoob: ${JSON.stringify(r).slice(0, 300)}`,
  })
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ ok: true, entrySettled: res.entrySettled })
}
