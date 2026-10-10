import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { limitarPorIp } from '@/lib/api/rate-limit'
import { mensagemErro } from '@/lib/errors'
import { criarLinkVisualizacao, type CredenciaisAmbra } from '@/lib/integrations/ambra'
import { decryptText } from '@/lib/crypto/segredo'

// POST /api/webhooks/ambra/<segredo>
//
// Recebe o aviso da Ambra de que a primeira imagem de um estudo chegou
// (evento STUDY_FIRST_IMAGE), acha o estudo correspondente pelo accession e
// pede à Ambra o link de visualização, guardando-o na OS.
//
// ── Por que o segredo vai no CAMINHO ──────────────────────────────────────
// A API v3 da Ambra NÃO assina a chamada: não há HMAC, nem token, nem segredo
// compartilhado documentado. Sem nenhuma defesa, quem descobrisse esta URL
// forjaria "a imagem chegou" e publicaria um link no portal do tutor.
//
// O segredo no caminho é o que dá para fazer com o que eles oferecem, e é por
// clínica — vazou o de uma, as outras seguem fechadas. É comparado em tempo
// constante. Está na nossa lista de perguntas à Ambra: se eles passarem a
// assinar, trocamos isto por verificação de assinatura.
//
// Idempotente: se o estudo já tem link válido, o evento é registrado e nada é
// recriado. A Ambra reenvia em caso de falha (parâmetro `retry`).

export const dynamic = 'force-dynamic'

interface EventoAmbra {
  event?:            string
  accession_number?: string
  study_uid?:        string
  uuid?:             string
  study_id?:         string
  [k: string]: unknown
}

function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ segredo: string }> },
) {
  const barrado = await limitarPorIp(request, { escopo: 'webhook:ambra', limite: 300 })
  if (barrado) return barrado

  const { segredo } = await ctx.params
  if (!segredo || segredo.length < 24) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const admin = createAdminClient()

  // O segredo identifica a clínica E autentica. Buscamos por ele e comparamos
  // em tempo constante para não vazar por tempo de resposta.
  const { data: configs } = await admin
    .from('clinic_ambra_config')
    .select('clinic_id, enabled, base_url, login, password_encrypted, phi_namespace, account_id, webhook_secret, link_minutes_alive, link_max_hits, notify_emails')
    .eq('enabled', true)

  const cfg = (configs ?? []).find(c => {
    const s = (c as { webhook_secret: string | null }).webhook_secret
    return !!s && igualSeguro(s, segredo)
  }) as {
    clinic_id: string; base_url: string; login: string | null
    password_encrypted: string | null; phi_namespace: string | null
    account_id: string | null; link_minutes_alive: number
    link_max_hits: number; notify_emails: string | null
  } | undefined

  if (!cfg) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  let corpo: EventoAmbra
  try {
    corpo = (await request.json()) as EventoAmbra
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const accession = String(corpo.accession_number ?? '').trim() || null
  const estudoUuid = String(corpo.uuid ?? corpo.study_id ?? '').trim() || null
  const evento = String(corpo.event ?? 'DESCONHECIDO')

  // Grava o evento ANTES de processar. Se o processamento falhar, o registro
  // fica — é ele que permite ao operador ver que chegou imagem e reprocessar.
  const { data: registro } = await admin
    .from('ambra_webhook_events')
    .insert({
      clinic_id: cfg.clinic_id,
      event: evento,
      accession_number: accession,
      study_uid: String(corpo.study_uid ?? '') || null,
      ambra_study_uuid: estudoUuid,
      payload: corpo as unknown as Record<string, unknown>,
    })
    .select('id')
    .single()

  const eventoId = (registro as { id: string } | null)?.id ?? null
  const encerrar = async (patch: Record<string, unknown>) => {
    if (eventoId) await admin.from('ambra_webhook_events').update(patch).eq('id', eventoId)
  }

  // Sem accession não há como casar. Respondemos 200 de propósito: o evento
  // ficou registrado e um 4xx só faria a Ambra reenviar algo que nunca vai
  // casar sozinho. Quem resolve é o operador, na tela.
  if (!accession) {
    await encerrar({ processed_at: new Date().toISOString(), error: 'Evento sem accession_number — amarrar manualmente.' })
    return NextResponse.json({ ok: true, matched: false, reason: 'sem accession' })
  }

  const { data: estudos } = await admin
    .from('imaging_studies')
    .select('id, ambra_link_url, ambra_link_expires_at')
    .eq('clinic_id', cfg.clinic_id)
    .eq('accession_number', accession)
    .order('created_at', { ascending: false })
    .limit(1)

  const estudo = (estudos ?? [])[0] as
    { id: string; ambra_link_url: string | null; ambra_link_expires_at: string | null } | undefined

  if (!estudo) {
    await encerrar({ processed_at: new Date().toISOString(), error: `Nenhum estudo com accession ${accession}.` })
    return NextResponse.json({ ok: true, matched: false, reason: 'accession sem estudo' })
  }

  // Já tem link que ainda vale? Nada a fazer.
  const aindaVale = estudo.ambra_link_url
    && estudo.ambra_link_expires_at
    && new Date(estudo.ambra_link_expires_at).getTime() > Date.now()
  if (aindaVale) {
    await encerrar({ study_id: estudo.id, processed_at: new Date().toISOString() })
    return NextResponse.json({ ok: true, matched: true, reused: true })
  }

  const senha = decryptText(cfg.password_encrypted)
  if (!cfg.login || !senha) {
    await encerrar({ study_id: estudo.id, processed_at: new Date().toISOString(), error: 'Credencial da Ambra ausente ou ilegível.' })
    return NextResponse.json({ ok: true, matched: true, linked: false })
  }

  const cred: CredenciaisAmbra = {
    base_url: cfg.base_url,
    login: cfg.login,
    password: senha,
    phi_namespace: cfg.phi_namespace,
    account_id: cfg.account_id,
  }

  try {
    // O evento já traz o uuid do estudo; não precisa consultar study/list.
    if (!estudoUuid) throw new Error('Evento sem uuid do estudo.')

    const link = await criarLinkVisualizacao(cred, estudoUuid, {
      minutosDeVida: cfg.link_minutes_alive,
      maxAcessos:    cfg.link_max_hits,
      notificar:     cfg.notify_emails,
    })

    await admin.from('imaging_studies').update({
      ambra_study_uuid:      estudoUuid,
      ambra_link_url:        link.url,
      ambra_link_expires_at: link.expiraEm.toISOString(),
      ambra_synced_at:       new Date().toISOString(),
      // A chegada da imagem é o que marca o estudo como tendo imagens. Só
      // preenche se ainda estiver vazio, para não sobrescrever upload manual.
      images_uploaded_at:    new Date().toISOString(),
    }).eq('id', estudo.id).is('ambra_link_url', null)

    await encerrar({ study_id: estudo.id, processed_at: new Date().toISOString() })
    return NextResponse.json({ ok: true, matched: true, linked: true })
  } catch (e) {
    // 500 de propósito: a Ambra reenvia (retry), e este caso — API fora,
    // credencial expirada — costuma resolver sozinho na segunda tentativa.
    const msg = mensagemErro(e, 'app/api/webhooks/ambra/route.ts')
    await encerrar({ study_id: estudo.id, error: msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
