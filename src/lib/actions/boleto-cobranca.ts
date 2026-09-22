'use server'

import { randomBytes } from 'crypto'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gerarBoletoSicoob } from '@/lib/boleto/febraban'
import { buildBoletoView, type BoletoView } from '@/lib/boleto/view'
import { incluirBoleto, type CobrancaRuntime } from '@/lib/integrations/sicoob-cobranca'
import { evolutionSendText } from '@/lib/evolution-api-client'
import { logBoletoEvent } from '@/lib/boleto/events'

async function getOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app')
}

// ─── Contexto / permissão ─────────────────────────────────────────────────────
type Ctx = { userId: string; clinicId: string; role: string; name: string | null }
async function ctx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: p } = await supabase.from('profiles').select('clinic_id, role, full_name').eq('id', user.id).single()
  if (!p?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { userId: user.id, clinicId: p.clinic_id as string, role: (p.role as string) ?? '', name: (p.full_name as string) ?? null }
}
const canManage = (role: string) => ['admin', 'owner', 'manager'].includes(role)

// ─── Config da carteira (por conta bancária) ─────────────────────────────────
export interface BoletoConfig {
  agencia?: string; conta?: string; contaDv?: string
  carteira?: string; modalidade?: string; codigoCliente?: string
  multaPercent?: number; jurosMesPercent?: number
  instrucaoCodigo?: string; mensagens?: string[]; especie?: string
  beneficiarioNome?: string; beneficiarioDoc?: string; beneficiarioEndereco?: string
  environment?: 'sandbox' | 'production'
}
export interface BankAccountBoleto { id: string; name: string; bankName: string | null; enabled: boolean; nextNossoNumero: number; config: BoletoConfig }

export async function listBoletoAccounts(): Promise<BankAccountBoleto[]> {
  const c = await ctx(); if ('error' in c) return []
  const admin = createAdminClient()
  const { data } = await admin.from('bank_accounts')
    .select('id, name, bank_name, boleto_enabled, next_nosso_numero, boleto_config')
    .eq('clinic_id', c.clinicId).order('is_default', { ascending: false }).order('name')
  return (data ?? []).map((a: any) => ({
    id: a.id, name: a.name, bankName: a.bank_name ?? null, enabled: !!a.boleto_enabled,
    nextNossoNumero: Number(a.next_nosso_numero ?? 1), config: (a.boleto_config ?? {}) as BoletoConfig,
  }))
}

export async function saveBoletoConfig(bankAccountId: string, config: BoletoConfig, enabled: boolean, nextNossoNumero?: number): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!canManage(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const patch: Record<string, unknown> = { boleto_config: config, boleto_enabled: enabled }
  if (typeof nextNossoNumero === 'number' && nextNossoNumero >= 1) patch.next_nosso_numero = Math.floor(nextNossoNumero)
  const { error } = await admin.from('bank_accounts').update(patch).eq('id', bankAccountId).eq('clinic_id', c.clinicId)
  return error ? { error: error.message } : { ok: true }
}

// ─── Duplicatas em aberto (recebíveis) p/ emitir/reimprimir ──────────────────
export interface ReceivableRow {
  id: string; description: string | null; amount: number; dueDate: string | null
  tutorId: string | null; tutorName: string | null; documentNumber: string | null
  boletoId: string | null; boletoSituacao: string | null; nossoNumero: string | null
}

export async function listReceivablesForBoleto(): Promise<ReceivableRow[]> {
  const c = await ctx(); if ('error' in c) return []
  const admin = createAdminClient()
  const { data: entries } = await admin.from('financial_entries')
    .select('id, description, amount, due_date, tutor_id, document_number, tutors:tutor_id ( name )')
    .eq('clinic_id', c.clinicId).eq('type', 'receivable').eq('status', 'pending')
    .order('due_date', { ascending: true }).limit(300)
  const ids = (entries ?? []).map((e: any) => e.id)
  const boletoByEntry = new Map<string, any>()
  if (ids.length) {
    const { data: bs } = await admin.from('clinic_boletos')
      .select('id, financial_entry_id, situacao, nosso_numero, created_at')
      .eq('clinic_id', c.clinicId).in('financial_entry_id', ids).order('created_at', { ascending: false })
    for (const b of (bs ?? [])) if (!boletoByEntry.has((b as any).financial_entry_id)) boletoByEntry.set((b as any).financial_entry_id, b)
  }
  return (entries ?? []).map((e: any) => {
    const b = boletoByEntry.get(e.id)
    return {
      id: e.id, description: e.description ?? null, amount: Number(e.amount), dueDate: e.due_date ?? null,
      tutorId: e.tutor_id ?? null, tutorName: (Array.isArray(e.tutors) ? e.tutors[0] : e.tutors)?.name ?? null,
      documentNumber: e.document_number ?? null,
      boletoId: b?.id ?? null, boletoSituacao: b?.situacao ?? null, nossoNumero: b?.nosso_numero ?? null,
    }
  })
}

// ─── Emissão / reimpressão ────────────────────────────────────────────────────
function runtimeFromConfig(cfg: BoletoConfig): CobrancaRuntime {
  const environment = cfg.environment === 'production' ? 'production' : 'sandbox'
  return {
    environment,
    numeroCliente: Number((cfg.codigoCliente ?? '').replace(/\D/g, '')) || (environment === 'sandbox' ? 25546454 : 0),
    numeroContaCorrente: Number((cfg.conta ?? '').replace(/\D/g, '')) || (environment === 'sandbox' ? 12345 : 0),
    codigoModalidade: Number(cfg.modalidade ?? 1) || 1,
  }
}

export async function emitOrReprintBoleto(financialEntryId: string, bankAccountId?: string): Promise<{ ok: true; boletoId: string; reprint: boolean } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!canManage(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()

  // já existe boleto? → reimpressão
  const { data: existing } = await admin.from('clinic_boletos')
    .select('id').eq('clinic_id', c.clinicId).eq('financial_entry_id', financialEntryId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if ((existing as any)?.id) {
    await logBoletoEvent(admin, { clinicId: c.clinicId, boletoId: (existing as any).id, eventType: 'reimpresso', actorId: c.userId, actorName: c.name, detail: '2ª via / reimpressão visualizada' })
    return { ok: true, boletoId: (existing as any).id, reprint: true }
  }

  // recebível
  const { data: entry } = await admin.from('financial_entries')
    .select('id, amount, due_date, description, tutor_id, document_number, company_id, consultation_id')
    .eq('id', financialEntryId).eq('clinic_id', c.clinicId).maybeSingle()
  if (!entry) return { error: 'Recebível não encontrado.' }

  // conta bancária + config
  let accountId = bankAccountId
  if (!accountId) {
    const { data: def } = await admin.from('bank_accounts').select('id').eq('clinic_id', c.clinicId).eq('boleto_enabled', true).order('is_default', { ascending: false }).limit(1).maybeSingle()
    accountId = (def as any)?.id
  }
  if (!accountId) return { error: 'Configure uma conta com carteira bancária (aba Carteira Bancária no cadastro da conta).' }
  const { data: acc } = await admin.from('bank_accounts').select('id, boleto_config, boleto_enabled').eq('id', accountId).eq('clinic_id', c.clinicId).maybeSingle()
  if (!acc || !(acc as any).boleto_enabled) return { error: 'Conta sem carteira bancária habilitada.' }
  const cfg = ((acc as any).boleto_config ?? {}) as BoletoConfig

  // pagador (tutor)
  let pag = { nome: 'Pagador', cpfCnpj: '', endereco: '', bairro: '', cidade: '', cep: '', uf: '', email: '' }
  if ((entry as any).tutor_id) {
    const { data: t } = await admin.from('tutors').select('name, cpf, address, email').eq('id', (entry as any).tutor_id).maybeSingle()
    if (t) pag = { nome: (t as any).name ?? 'Pagador', cpfCnpj: (t as any).cpf ?? '', endereco: (t as any).address ?? '', bairro: '', cidade: '', cep: '', uf: '', email: (t as any).email ?? '' }
  }

  // nosso número sequencial (atômico)
  const { data: nn, error: nnErr } = await admin.rpc('next_nosso_numero', { p_bank_account_id: accountId })
  if (nnErr || nn == null) return { error: 'Falha ao gerar nosso número.' }
  const nossoNumero = String(nn)

  const valor = Number((entry as any).amount)
  const dueISO = ((entry as any).due_date ?? new Date().toISOString()).slice(0, 10)
  const seuNumero = (entry as any).document_number || `OS-${nossoNumero}`

  // cálculo local (para preview/desenho) — em produção usamos o retorno do banco
  const local = gerarBoletoSicoob({
    agencia: cfg.agencia ?? '0000', codigoCliente: cfg.codigoCliente ?? '0', carteira: cfg.carteira,
    modalidade: cfg.modalidade, nossoNumero, valor, dueISO,
  })

  // chamada ao Sicoob (best-effort; sandbox é mock)
  let linha = local.linhaDigitavel, barras = local.codigoBarras, situacao = 'emitido', errorMsg: string | null = null, raw: unknown = null
  try {
    const rt = runtimeFromConfig(cfg)
    const res = await incluirBoleto(rt, {
      seuNumero, valor, dataVencimento: dueISO, especie: cfg.especie,
      multaPercent: cfg.multaPercent, jurosMesPercent: cfg.jurosMesPercent, mensagens: cfg.mensagens,
      pagador: pag,
    })
    if (res.ok) {
      situacao = 'registrado'; raw = res.raw
      if (res.result.linhaDigitavel) linha = res.result.linhaDigitavel
      if (res.result.codigoBarras) barras = res.result.codigoBarras
    } else { errorMsg = res.error; raw = (res as any).raw ?? null }
  } catch (e) { errorMsg = e instanceof Error ? e.message : 'erro' }

  const publicToken = 'blt_' + randomBytes(20).toString('hex')
  const { data: row, error } = await admin.from('clinic_boletos').insert({
    clinic_id: c.clinicId, company_id: (entry as any).company_id ?? null, bank_account_id: accountId,
    consultation_id: (entry as any).consultation_id ?? null, financial_entry_id: financialEntryId, tutor_id: (entry as any).tutor_id ?? null,
    provider: 'sicoob', environment: cfg.environment ?? 'sandbox',
    seu_numero: seuNumero, nosso_numero: nossoNumero, nosso_numero_dv: local.nossoNumeroFmt,
    valor, vencimento: dueISO, linha_digitavel: linha, codigo_barras: barras,
    situacao, pagador_nome: pag.nome, pagador_cpf_cnpj: (pag.cpfCnpj ?? '').replace(/\D/g, ''),
    public_token: publicToken, raw_response: raw as any, error_message: errorMsg, created_by: c.userId,
  }).select('id').single()
  if (error) return { error: error.message }
  const boletoId = (row as any).id
  await logBoletoEvent(admin, {
    clinicId: c.clinicId, boletoId, eventType: errorMsg ? 'erro' : 'emitido', actorId: c.userId, actorName: c.name,
    detail: errorMsg ? `Falha no registro: ${errorMsg}` : `Boleto emitido — nosso nº ${local.nossoNumeroFmt}, valor R$ ${valor.toFixed(2)}, venc. ${dueISO.split('-').reverse().join('/')} (${cfg.environment ?? 'sandbox'})`,
    situacao, payload: raw,
  })
  return { ok: true, boletoId, reprint: false }
}

// ─── View do boleto (tela + público) ─────────────────────────────────────────
async function loadBoletoView(admin: ReturnType<typeof createAdminClient>, where: { id?: string; token?: string; clinicId?: string }): Promise<BoletoView | null> {
  let q = admin.from('clinic_boletos').select('*')
  if (where.id) q = q.eq('id', where.id)
  if (where.token) q = q.eq('public_token', where.token)
  if (where.clinicId) q = q.eq('clinic_id', where.clinicId)
  const { data: row } = await q.maybeSingle()
  if (!row) return null
  let cfg = {}
  if ((row as any).bank_account_id) {
    const { data: acc } = await admin.from('bank_accounts').select('boleto_config').eq('id', (row as any).bank_account_id).maybeSingle()
    cfg = (acc as any)?.boleto_config ?? {}
  }
  return buildBoletoView(row as any, cfg as any)
}

export async function getBoletoView(boletoId: string): Promise<BoletoView | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  const admin = createAdminClient()
  const v = await loadBoletoView(admin, { id: boletoId, clinicId: c.clinicId })
  return v ?? { error: 'Boleto não encontrado.' }
}

/** Público — usado pela página /public/boleto/[token]. */
export async function getBoletoViewByToken(token: string): Promise<BoletoView | null> {
  const admin = createAdminClient()
  return loadBoletoView(admin, { token })
}

// ─── Envio por e-mail / WhatsApp ──────────────────────────────────────────────
async function boletoLinkAndContacts(admin: ReturnType<typeof createAdminClient>, clinicId: string, boletoId: string) {
  const { data: b } = await admin.from('clinic_boletos')
    .select('id, public_token, tutor_id, partner_clinic_id, valor, vencimento, linha_digitavel, pagador_nome')
    .eq('id', boletoId).eq('clinic_id', clinicId).maybeSingle()
  if (!b) return null
  let email: string | null = null, phone: string | null = null, nome: string | null = (b as any).pagador_nome ?? null
  if ((b as any).tutor_id) {
    const { data: t } = await admin.from('tutors').select('name, email, phone').eq('id', (b as any).tutor_id).maybeSingle()
    if (t) { email = (t as any).email ?? null; phone = (t as any).phone ?? null; nome = (t as any).name ?? nome }
  } else if ((b as any).partner_clinic_id) {
    const { data: pc } = await admin.from('partner_clinics').select('name, email, phone').eq('id', (b as any).partner_clinic_id).maybeSingle()
    if (pc) { email = (pc as any).email ?? null; phone = (pc as any).phone ?? null; nome = (pc as any).name ?? nome }
  }
  const origin = await getOrigin()
  return { b, email, phone, nome, url: `${origin}/public/boleto/${(b as any).public_token}` }
}

export async function sendBoletoEmail(boletoId: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!canManage(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const info = await boletoLinkAndContacts(admin, c.clinicId, boletoId)
  if (!info) return { error: 'Boleto não encontrado.' }
  if (!info.email) return { error: 'Destinatário sem e-mail cadastrado.' }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { error: 'Envio de e-mail não configurado (RESEND_API_KEY).' }
  const valorFmt = Number((info.b as any).valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const venc = ((info.b as any).vencimento ?? '').slice(0, 10).split('-').reverse().join('/')
  const linha = (info.b as any).linha_digitavel ?? ''
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    const html = `<div style="font-family:Arial,sans-serif;color:#1a2b24;max-width:560px;margin:auto">
      <h2 style="color:#0E3B2E">Boleto para pagamento</h2>
      <p>Olá${info.nome ? ' ' + info.nome : ''}, segue seu boleto no valor de <strong>${valorFmt}</strong>, vencimento <strong>${venc}</strong>.</p>
      <p style="background:#f1efe8;padding:10px;border-radius:6px;font-family:monospace">${linha}</p>
      <p><a href="${info.url}" style="background:#0E3B2E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Abrir e imprimir o boleto</a></p>
      <p style="color:#8a968e;font-size:12px">Se o botão não abrir, copie: ${info.url}</p></div>`
    await resend.emails.send({ from: 'SysVetMax <noreply@sysmaxsolutions.com>', to: info.email, subject: `Boleto — ${valorFmt} (venc. ${venc})`, html })
  } catch (e) { return { error: e instanceof Error ? e.message : 'Falha ao enviar e-mail.' } }
  await admin.from('clinic_boletos').update({ email_sent_at: new Date().toISOString() }).eq('id', boletoId)
  await logBoletoEvent(admin, { clinicId: c.clinicId, boletoId, eventType: 'email_enviado', actorId: c.userId, actorName: c.name, detail: `Boleto enviado por e-mail para ${info.email}` })
  return { ok: true }
}

export async function sendBoletoWhatsApp(boletoId: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!canManage(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const info = await boletoLinkAndContacts(admin, c.clinicId, boletoId)
  if (!info) return { error: 'Boleto não encontrado.' }
  if (!info.phone) return { error: 'Destinatário sem telefone cadastrado.' }
  const { data: wpp } = await admin.from('clinic_whatsapp_settings').select('evolution_instance_name').eq('clinic_id', c.clinicId).maybeSingle()
  const instanceId = (wpp as any)?.evolution_instance_name
  const apiUrl = process.env.EVOLUTION_API_URL, apiKey = process.env.EVOLUTION_API_KEY
  if (!instanceId || !apiUrl || !apiKey) return { error: 'WhatsApp não configurado nesta clínica.' }
  const valorFmt = Number((info.b as any).valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const venc = ((info.b as any).vencimento ?? '').slice(0, 10).split('-').reverse().join('/')
  const linha = (info.b as any).linha_digitavel ?? ''
  const msg = `Olá${info.nome ? ' ' + info.nome : ''}! 🧾\nSegue seu boleto de *${valorFmt}* (venc. ${venc}).\n\nLinha digitável:\n${linha}\n\nAbrir/imprimir: ${info.url}`
  const id = await evolutionSendText({ apiUrl, instanceId, apiKey }, info.phone, msg)
  if (!id) return { error: 'Falha ao enviar pelo WhatsApp.' }
  await admin.from('clinic_boletos').update({ whatsapp_sent_at: new Date().toISOString() }).eq('id', boletoId)
  await logBoletoEvent(admin, { clinicId: c.clinicId, boletoId, eventType: 'whatsapp_enviado', actorId: c.userId, actorName: c.name, detail: `Boleto enviado por WhatsApp para ${info.phone}` })
  return { ok: true }
}

// ─── Relatório de movimentação / trilha de auditoria dos boletos ─────────────
export interface BoletoMovement {
  id: string; createdAt: string; eventType: string; actorType: string; actorName: string | null
  detail: string | null; situacao: string | null
  boletoId: string; pagadorNome: string | null; nossoNumero: string | null; seuNumero: string | null
  valor: number | null; vencimento: string | null; tituloStatus: string | null; environment: string | null
}

const EVENT_LABEL: Record<string, string> = {
  emitido: 'Emitido', reimpresso: 'Reimpresso (2ª via)', email_enviado: 'Enviado por e-mail',
  whatsapp_enviado: 'Enviado por WhatsApp', consulta: 'Consulta ao banco', retorno_banco: 'Retorno do banco',
  instrucao: 'Instrução ao banco', pago: 'Pago', baixado: 'Baixado/cancelado', erro: 'Erro',
}
export async function boletoEventLabel(t: string): Promise<string> { return EVENT_LABEL[t] ?? t }

/** Movimentação completa (relatório): eventos + boleto + quem fez + situação do título. */
export async function listBoletoMovements(filters?: { from?: string; to?: string; eventType?: string; situacao?: string; search?: string }): Promise<BoletoMovement[]> {
  const c = await ctx(); if ('error' in c) return []
  const admin = createAdminClient()
  let q = admin.from('clinic_boleto_events')
    .select('id, created_at, event_type, actor_type, actor_id, actor_name, detail, situacao, boleto_id, profiles:actor_id ( full_name ), clinic_boletos:boleto_id ( pagador_nome, nosso_numero, seu_numero, valor, vencimento, environment, financial_entry_id )')
    .eq('clinic_id', c.clinicId)
  if (filters?.from) q = q.gte('created_at', filters.from)
  if (filters?.to) q = q.lte('created_at', filters.to + 'T23:59:59')
  if (filters?.eventType) q = q.eq('event_type', filters.eventType)
  const { data } = await q.order('created_at', { ascending: false }).limit(1000)

  // situação do título (financial_entries) por boleto
  const entryIds = Array.from(new Set((data ?? []).map((e: any) => e.clinic_boletos?.financial_entry_id).filter(Boolean)))
  const statusByEntry = new Map<string, string>()
  if (entryIds.length) {
    const { data: fes } = await admin.from('financial_entries').select('id, status').in('id', entryIds)
    for (const f of (fes ?? [])) statusByEntry.set((f as any).id, (f as any).status)
  }

  let rows: BoletoMovement[] = (data ?? []).map((e: any) => {
    const b = e.clinic_boletos ?? {}
    const prof = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles
    return {
      id: e.id, createdAt: e.created_at, eventType: e.event_type, actorType: e.actor_type,
      actorName: e.actor_name ?? prof?.full_name ?? (e.actor_type === 'bank' ? 'Banco Sicoob' : e.actor_type === 'system' ? 'Sistema' : '—'),
      detail: e.detail ?? null, situacao: e.situacao ?? null,
      boletoId: e.boleto_id, pagadorNome: b.pagador_nome ?? null, nossoNumero: b.nosso_numero ?? null,
      seuNumero: b.seu_numero ?? null, valor: b.valor != null ? Number(b.valor) : null, vencimento: b.vencimento ?? null,
      tituloStatus: b.financial_entry_id ? (statusByEntry.get(b.financial_entry_id) ?? null) : null,
      environment: b.environment ?? null,
    }
  })
  if (filters?.situacao) rows = rows.filter(r => r.tituloStatus === filters.situacao)
  if (filters?.search) {
    const s = filters.search.toLowerCase()
    rows = rows.filter(r => (r.pagadorNome ?? '').toLowerCase().includes(s) || (r.nossoNumero ?? '').includes(s) || (r.seuNumero ?? '').toLowerCase().includes(s))
  }
  return rows
}

/** Trilha de um boleto específico (timeline). */
export async function getBoletoEvents(boletoId: string): Promise<{ id: string; createdAt: string; eventType: string; actorName: string | null; detail: string | null; situacao: string | null }[]> {
  const c = await ctx(); if ('error' in c) return []
  const admin = createAdminClient()
  const { data } = await admin.from('clinic_boleto_events')
    .select('id, created_at, event_type, actor_type, actor_name, detail, situacao, profiles:actor_id ( full_name )')
    .eq('clinic_id', c.clinicId).eq('boleto_id', boletoId).order('created_at', { ascending: true })
  return (data ?? []).map((e: any) => {
    const prof = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles
    return { id: e.id, createdAt: e.created_at, eventType: e.event_type,
      actorName: e.actor_name ?? prof?.full_name ?? (e.actor_type === 'bank' ? 'Banco Sicoob' : e.actor_type === 'system' ? 'Sistema' : '—'),
      detail: e.detail ?? null, situacao: e.situacao ?? null }
  })
}
