import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { limitarPorIp } from '@/lib/api/rate-limit'
import { decryptSecret } from '@/lib/integrations/bank-certificate'
import { lerValorDeles } from '@/lib/integrations/evoluservices-valores'
import { consultarOrder, baseDoAmbiente, type CredenciaisEvolu } from '@/lib/integrations/evoluservices'
import { mensagemErro } from '@/lib/errors'

// Webhook da EvoluServices / FinPet — retorno das transações de cartão.
//
// SEGURANÇA: ELES NÃO ASSINAM O CALLBACK
// --------------------------------------
// A documentação não traz HMAC, segredo compartilhado nem qualquer validação —
// foi a primeira pergunta que mandamos a eles e segue sem resposta. Sem
// assinatura, quem descobrir a URL forja "pagamento aprovado" e dá baixa num
// título que ninguém pagou.
//
// Duas defesas, e as duas são necessárias:
//
//   1. O segredo está no CAMINHO da URL e é por empresa faturante — vazar o de
//      uma não compromete as outras, e é por ele que a empresa é identificada.
//   2. **Nenhuma baixa de título vale sem confirmação por consulta à API.** O
//      callback é tratado como aviso, não como verdade: gravamos o que chegou e
//      só liberamos efeito financeiro depois de perguntar à EvoluServices qual é
//      o status real daquela cobrança.
//
// COMPORTAMENTO MEDIDO (22/10/2026)
// ---------------------------------
//   * O callback é reentregue a cada mudança de estado — criação, aprovação,
//     pagamento de cada parcela. É upsert por `transactionNumber`, nunca insert.
//   * Há DOIS formatos: o da maquininha é JSON rico (com `payments[]` e
//     `splits[]`); o do Link é `x-www-form-urlencoded` com apenas `uuid` e
//     `transactionNumber` — não diz nada do que aconteceu, e por isso o fluxo do
//     Link **exige** a consulta.
//   * No POS o callback chega 10 a 15 minutos depois da transação; o caixa não
//     espera por ele.

export const dynamic = 'force-dynamic'

type Json = Record<string, unknown>

/** Aceita JSON (maquininha) e x-www-form-urlencoded (link), sem exigir um deles. */
async function lerCorpo(req: Request): Promise<Json | null> {
  const tipo = (req.headers.get('content-type') ?? '').toLowerCase()
  try {
    if (tipo.includes('application/json')) {
      return await req.json() as Json
    }
    const texto = await req.text()
    if (!texto) return {}
    // Form urlencoded — é como o callback do Link chega.
    if (tipo.includes('x-www-form-urlencoded') || /^[\w%.\-]+=/.test(texto)) {
      const p = new URLSearchParams(texto)
      return Object.fromEntries(p.entries())
    }
    // Sem content-type confiável: tenta JSON de todo modo.
    return JSON.parse(texto) as Json
  } catch {
    return null
  }
}

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** 'dd/MM/yyyy' (formato deles) para 'yyyy-MM-dd'. */
function paraDataISO(bruto: unknown): string | null {
  const s = texto(bruto)
  if (!s) return null
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

export async function POST(req: Request, ctx: { params: Promise<{ segredo: string }> }) {
  const barrado = await limitarPorIp(req, { escopo: 'wh:evoluservices', limite: 300 })
  if (barrado) return barrado

  const { segredo } = await ctx.params
  if (!segredo || segredo.length < 16) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // ─── 1. identifica a empresa pelo segredo da URL ──────────────────────────
  const { data: cfg } = await admin
    .from('company_card_acquirer')
    .select('company_id, clinic_id, environment, merchant_id, api_username, api_key_encrypted, basic_auth_encrypted, enabled')
    .eq('webhook_secret', segredo)
    .maybeSingle()

  if (!cfg) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const corpo = await lerCorpo(req)
  if (!corpo) return NextResponse.json({ error: 'corpo ilegível' }, { status: 400 })

  const transactionNumber = texto(corpo.transactionNumber)
  const orderUuid = texto(corpo.orderUuid) ?? texto(corpo.uuid)

  if (!transactionNumber && !orderUuid) {
    return NextResponse.json({ error: 'sem transactionNumber nem uuid' }, { status: 400 })
  }

  // ─── 2. acha a cobrança ───────────────────────────────────────────────────
  //
  // Pelo número da transação (reentrega) ou pelo uuid da order (primeiro
  // callback de um link). Não encontrar NÃO é erro: pode ser uma venda passada
  // direto na maquininha, sem passar pelo sistema — e é justamente o caso que a
  // URL de callback global resolve. Guardamos para o operador ver.
  // Tipo local: o cliente tipado do Supabase infere `never` quando a coluna e
  // nova no schema cache, e o cast direto nao resolve.
  type Cobranca = { id: string; kind: string; order_uuid: string | null; amount: number }
  let registro: Cobranca | null = null

  if (transactionNumber) {
    const { data } = await admin
      .from('card_transactions')
      .select('id, kind, order_uuid, amount')
      .eq('clinic_id', cfg.clinic_id)
      .eq('transaction_number', transactionNumber)
      .maybeSingle()
    registro = (data as unknown as Cobranca | null) ?? null
  }
  if (!registro && orderUuid) {
    const { data } = await admin
      .from('card_transactions')
      .select('id, kind, order_uuid, amount')
      .eq('clinic_id', cfg.clinic_id)
      .eq('order_uuid', orderUuid)
      .maybeSingle()
    registro = (data as unknown as Cobranca | null) ?? null
  }

  // ─── 3. CONFIRMA na API antes de dar qualquer efeito ──────────────────────
  //
  // O callback não é assinado: tratá-lo como verdade seria aceitar baixa de
  // título de quem descobrisse a URL. Para cobrança por link a consulta é
  // obrigatória de todo modo, porque o callback do link não traz status.
  let statusConfirmado: string | null = null
  let valorConfirmado: number | null = null
  let parcelasConfirmadas: Array<{ numero: number; valor: number; status: string; data: string | null }> = []
  let avisoConfirmacao: string | null = null

  const uuidParaConsulta = orderUuid ?? registro?.order_uuid ?? null
  if (uuidParaConsulta) {
    const apiKey = decryptSecret(cfg.api_key_encrypted)?.toString('utf8') ?? null
    const basic = decryptSecret(cfg.basic_auth_encrypted)?.toString('utf8') ?? null
    if (apiKey && cfg.api_username && cfg.merchant_id) {
      const cred: CredenciaisEvolu = {
        base: baseDoAmbiente(cfg.environment),
        username: cfg.api_username,
        apiKey,
        merchantId: cfg.merchant_id,
        basicAuth: basic,
      }
      const consulta = await consultarOrder(cred, uuidParaConsulta)
      if (consulta.ok) {
        statusConfirmado = consulta.dados.status
        const primeira = consulta.dados.transacoes[0]
        if (primeira) {
          valorConfirmado = primeira.valor
          parcelasConfirmadas = primeira.pagamentos.map(p => ({
            numero: p.numero, valor: p.valor, status: p.status, data: paraDataISO(p.dataPrevista),
          }))
        }
      } else {
        // Falha isolada na confirmação não descarta o callback: gravamos o que
        // chegou e deixamos o aviso visível, em vez de perder o evento.
        avisoConfirmacao = consulta.erro.mensagem
      }
    } else {
      avisoConfirmacao = 'Credencial da empresa incompleta — não foi possível confirmar na operadora.'
    }
  }

  // ─── 4. grava (upsert: o callback repete) ─────────────────────────────────
  const statusCallback = texto(corpo.status)
  const statusFinal = statusConfirmado ?? statusCallback
  // O valor que vale é o confirmado pela API; o do callback é indicativo.
  const valorCallback = corpo.value === undefined ? null : lerValorDeles(corpo.value)

  const patch: Record<string, unknown> = {
    status:               statusFinal,
    transaction_number:   transactionNumber,
    order_uuid:           uuidParaConsulta,
    payment_brand:        texto(corpo.paymentBrand),
    terminal_id:          texto(corpo.terminalId),
    nsu:                  texto(corpo.NSU) ?? texto(corpo.nsu),
    authorization_number: texto(corpo.authorizationNumber),
    last_callback:        corpo,
    updated_at:           new Date().toISOString(),
  }

  let idRegistro = registro?.id ?? null

  if (idRegistro) {
    const { data: atual } = await admin
      .from('card_transactions').select('callback_count').eq('id', idRegistro).maybeSingle()
    patch.callback_count = Number(atual?.callback_count ?? 0) + 1
    const { error } = await admin.from('card_transactions')
      .update(patch).eq('id', idRegistro).eq('clinic_id', cfg.clinic_id)
    if (error) {
      return NextResponse.json(
        { error: 'erro ao gravar: ' + mensagemErro(error, 'api/webhooks/evoluservices') }, { status: 500 })
    }
  } else {
    // Venda que não passou pelo sistema (digitada direto na máquina). Registrar
    // é o ponto da URL de callback global: sem isso, essa venda nunca apareceria
    // no nosso financeiro, que é exatamente o problema da recepção hoje.
    const { data: nova, error } = await admin.from('card_transactions').insert({
      clinic_id:  cfg.clinic_id,
      company_id: cfg.company_id,
      kind:       orderUuid && !transactionNumber ? 'link' : 'remote',
      reference:  `EXTERNA-${transactionNumber ?? orderUuid}`,
      amount:     valorConfirmado ?? valorCallback ?? 0.01,
      callback_count: 1,
      ...patch,
    }).select('id').single()
    if (error) {
      return NextResponse.json(
        { error: 'erro ao registrar venda externa: ' + mensagemErro(error, 'api/webhooks/evoluservices') },
        { status: 500 })
    }
    idRegistro = (nova as unknown as { id: string }).id
  }

  // ─── 5. parcelas e splits, parcela a parcela ──────────────────────────────
  //
  // É o que faz o contábil refletir a realidade: a parte do profissional vai
  // direta a ele e não passa pela conta da clínica, e o retorno já diz quanto e
  // quando. Persistimos o que vem, sem recalcular rateio.
  const linhas: Array<Record<string, unknown>> = []

  const empurrar = (kind: 'merchant' | 'split', item: Json) => {
    const numero = Number(item.number ?? 0)
    if (!numero) return
    linhas.push({
      clinic_id:           cfg.clinic_id,
      card_transaction_id: idRegistro,
      kind,
      number:              numero,
      amount:              lerValorDeles(item.value),
      status:              texto(item.status),
      pay_date:            paraDataISO(item.date),
      recipient_name:      texto(item.recipientName),
      recipient_document:  texto(item.recipientDocument),
    })
  }

  for (const p of Array.isArray(corpo.payments) ? corpo.payments : []) empurrar('merchant', p as Json)
  for (const s of Array.isArray(corpo.splits) ? corpo.splits : []) empurrar('split', s as Json)

  // Quando o callback não traz parcela (caso do link), usa o que a consulta deu.
  if (linhas.length === 0 && parcelasConfirmadas.length > 0) {
    for (const p of parcelasConfirmadas) {
      linhas.push({
        clinic_id: cfg.clinic_id, card_transaction_id: idRegistro, kind: 'merchant',
        number: p.numero, amount: p.valor, status: p.status, pay_date: p.data,
        recipient_name: null, recipient_document: null,
      })
    }
  }

  if (linhas.length > 0) {
    const { error } = await admin
      .from('card_transaction_payments')
      .upsert(linhas, { onConflict: 'card_transaction_id,kind,number,recipient_document' })
    if (error) {
      // A cobrança já está gravada; perder as parcelas é ruim mas não apaga o
      // evento. Volta no corpo em vez de virar 500 silencioso.
      return NextResponse.json({
        ok: true, id: idRegistro,
        aviso: 'parcelas não gravadas: ' + mensagemErro(error, 'api/webhooks/evoluservices'),
      })
    }
  }

  // Amarra o split ao profissional pelo código de beneficiário, quando der.
  if (linhas.some(l => l.kind === 'split')) {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, acquirer_recipient_code, full_name')
      .eq('clinic_id', cfg.clinic_id)
      .not('acquirer_recipient_code', 'is', null)
    // O callback traz nome e documento do beneficiário, não o código — então o
    // vínculo é pelo documento quando houver, que é o dado estável.
    for (const l of linhas.filter(x => x.kind === 'split')) {
      const doc = String(l.recipient_document ?? '').replace(/\D/g, '')
      if (!doc) continue
      const achado = (profs ?? []).find(p => String(p.acquirer_recipient_code ?? '').replace(/\D/g, '') === doc)
      if (achado) {
        await admin.from('card_transaction_payments')
          .update({ professional_id: achado.id })
          .eq('card_transaction_id', idRegistro)
          .eq('kind', 'split')
          .eq('number', l.number as number)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    id: idRegistro,
    status: statusFinal,
    confirmado_na_api: statusConfirmado !== null,
    parcelas: linhas.length,
    ...(avisoConfirmacao ? { aviso: avisoConfirmacao } : {}),
  })
}

/** Alguns provedores validam a URL com GET antes de cadastrar. */
export async function GET() {
  return NextResponse.json({ ok: true, servico: 'webhook EvoluServices' })
}
