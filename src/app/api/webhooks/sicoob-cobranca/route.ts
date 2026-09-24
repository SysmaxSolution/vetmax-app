import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { settleBoletoPaid } from '@/lib/boleto/settle'
import { logBoletoEvent } from '@/lib/boleto/events'
import { extractAccountHints, resolveBoletoCandidate, type BoletoCandidate } from '@/lib/boleto/webhook-resolve'

// Webhook de Cobrança Bancária Sicoob — notificação de pagamento (baixa automática).
// Registrado em produção (POST /webhooks na API Sicoob) apontando para esta URL
// com ?key=<SICOOB_WEBHOOK_SECRET>&conta=<token da conta>. Ao receber o pagamento,
// marca o boleto como pago e baixa o título vinculado com o detalhamento do banco.
//
// ⚠️ Multi-tenancy: `nosso_numero` é sequencial POR CONTA BANCÁRIA (0462) e começa
// em 1, então NÃO identifica clínica. A clínica sai do token `conta` na URL
// (caminho recomendado) ou do casamento dos dados de carteira presentes no
// payload. Havendo mais de um candidato, a rota FALHA (409) em vez de adivinhar.
export async function POST(req: Request) {
  const secret = process.env.SICOOB_WEBHOOK_SECRET
  const reqUrl = new URL(req.url)
  const key = reqUrl.searchParams.get('key')
  if (!secret || key !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const accountToken = (reqUrl.searchParams.get('conta') ?? '').trim()

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

  // ── 1. Resolve a conta bancária pelo token de callback, quando informado ────
  let scopedAccount: { id: string; clinic_id: string } | null = null
  if (accountToken) {
    const { data: acc } = await admin.from('bank_accounts')
      .select('id, clinic_id').eq('boleto_webhook_token', accountToken).maybeSingle()
    if (!acc) return NextResponse.json({ error: 'conta do webhook desconhecida' }, { status: 401 })
    scopedAccount = acc as { id: string; clinic_id: string }
  }

  // ── 2. Levanta TODOS os candidatos com esse nosso número ───────────────────
  let q = admin.from('clinic_boletos').select('id, clinic_id, bank_account_id').eq('nosso_numero', nossoNumero)
  if (scopedAccount) q = q.eq('clinic_id', scopedAccount.clinic_id).eq('bank_account_id', scopedAccount.id)
  const { data: rows, error: rowsErr } = await q
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })

  const list = (rows ?? []) as { id: string; clinic_id: string; bank_account_id: string | null }[]
  if (!list.length) return NextResponse.json({ ok: true, ignored: 'boleto não encontrado' })

  // Anexa a config da carteira de cada conta candidata, para desempate.
  const accountIds = [...new Set(list.map((x) => x.bank_account_id).filter(Boolean))] as string[]
  const configById = new Map<string, Record<string, string>>()
  if (accountIds.length > 1) {
    const { data: accs } = await admin.from('bank_accounts').select('id, boleto_config').in('id', accountIds)
    for (const a of (accs ?? []) as { id: string; boleto_config: Record<string, string> | null }[]) {
      configById.set(a.id, a.boleto_config ?? {})
    }
  }

  const candidates: BoletoCandidate[] = list.map((x) => ({
    id: x.id,
    clinicId: x.clinic_id,
    bankAccountId: x.bank_account_id,
    accountConfig: x.bank_account_id ? (configById.get(x.bank_account_id) ?? null) : null,
  }))

  const picked = resolveBoletoCandidate(candidates, extractAccountHints(body))
  if (!picked.ok) {
    if (picked.reason === 'not_found') return NextResponse.json({ ok: true, ignored: 'boleto não encontrado' })
    // Ambíguo: NÃO adivinhar. Falha explícita para o banco reenviar e para a
    // Sysmax registrar a URL com o token da conta.
    console.error('[sicoob-webhook] nosso número ambíguo', { nossoNumero, candidates: picked.candidates })
    return NextResponse.json({ error: picked.message, ambiguous: true, candidates: picked.candidates }, { status: 409 })
  }

  const b = picked.boleto

  // registra o retorno cru do banco na trilha
  await logBoletoEvent(admin, {
    clinicId: b.clinicId, boletoId: b.id, eventType: 'retorno_banco', actorType: 'bank', actorName: 'Banco Sicoob',
    detail: `Retorno recebido do banco — situação ${situacao || 'pagamento'}`, situacao: 'pago', payload: r,
  })

  const res = await settleBoletoPaid({ clinicId: b.clinicId, boletoId: b.id }, {
    paidAt, paidAmount, bankDetail: `Detalhe Sicoob: ${JSON.stringify(r).slice(0, 300)}`,
  })
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ ok: true, entrySettled: res.entrySettled })
}
