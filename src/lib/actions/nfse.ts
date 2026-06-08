'use server'

/**
 * Módulo Faturamento — NFS-e via Focus NFe (Fase 3).
 *
 * ARQUITETURA PREPARADA (08/06/2026) — provedor escolhido pelo PO: Focus NFe.
 * Este arquivo monta os payloads e endpoints de SANDBOX (homologação) do
 * provedor. As credenciais (token por ambiente) vivem na tabela dedicada
 * clinic_fiscal_config (migration 0362), NUNCA em env vars nem expostas ao
 * client — as actions usam o admin client e jamais retornam o token.
 *
 * Estado atual: SCAFFOLD. emitNfse() valida o cadastro e monta o payload, mas
 * a chamada HTTP real fica atrás de uma guarda até o token ser configurado e o
 * PO liberar a Fase 3. Sem credenciais embutidas.
 *
 * Docs Focus NFe: https://focusnfe.com.br/doc/  (NFS-e — recurso /v2/nfse)
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
// Constantes/helpers puros do provedor vivem fora do 'use server' (exports
// síncronos não são permitidos aqui). Reexportados via funções quando preciso.
import { FOCUS_NFE_ENDPOINTS, focusNfsePath } from '@/lib/billing/nfse-focus'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FiscalConfig {
  emits_nfse:          boolean
  is_active:           boolean
  environment:         'sandbox' | 'production'
  provider:            'focus_nfe'
  cnpj:                string | null
  inscricao_municipal: string | null
  razao_social:        string | null
  regime_tributario:   string | null
  optante_simples:     boolean
  codigo_municipio:    string | null
  cnae:                string | null
  item_lista_servico:  string | null
  codigo_tributario_municipio: string | null
  iss_aliquota:        number | null
  iss_retido:          boolean
  rps_serie:           string | null
  rps_proximo_numero:  number
  rps_lote:            number
  // Flags de presença do token (nunca expõe o valor ao client).
  has_token_sandbox:    boolean
  has_token_production: boolean
}

/** Payload de gravação da config fiscal. Tokens opcionais (só grava se vier). */
export interface FiscalConfigInput {
  emits_nfse?:          boolean
  is_active?:           boolean
  environment?:         'sandbox' | 'production'
  cnpj?:                string | null
  inscricao_municipal?: string | null
  razao_social?:        string | null
  regime_tributario?:   string | null
  optante_simples?:     boolean
  codigo_municipio?:    string | null
  cnae?:                string | null
  item_lista_servico?:  string | null
  codigo_tributario_municipio?: string | null
  iss_aliquota?:        number | null
  iss_retido?:          boolean
  rps_serie?:           string | null
  rps_proximo_numero?:  number
  rps_lote?:            number
  /** Quando presente (string não-vazia), atualiza o token do ambiente. */
  focus_token_sandbox?:    string
  focus_token_production?: string
}

/** Payload NFS-e no formato Focus NFe (subset essencial p/ serviços vet). */
export interface FocusNfsePayload {
  data_emissao: string
  prestador: {
    cnpj:                string
    inscricao_municipal: string
    codigo_municipio:    string
  }
  tomador: {
    cpf?:          string
    cnpj?:         string
    razao_social:  string
    email?:        string
    endereco: {
      logradouro:       string
      numero:           string
      complemento?:     string
      bairro:           string
      codigo_municipio: string
      uf:               string
      cep:              string
    }
  }
  servico: {
    aliquota:                  number
    discriminacao:             string
    iss_retido:                boolean
    item_lista_servico:        string
    codigo_tributario_municipio?: string
    valor_servicos:            number
  }
}

export interface NfseValidation {
  valid:   boolean
  blocks:  string[]   // impedimentos do prestador (config) e do tomador (tutor)
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

type Ctx = { admin: ReturnType<typeof createAdminClient>; clinic_id: string; user_id: string }

async function getCtx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { admin, clinic_id: profile.clinic_id as string, user_id: user.id }
}

// ─── getFiscalConfig (sem token) ──────────────────────────────────────────────
// Retorna a config fiscal SEM os tokens (segurança). Para a UI de Configurações.

export async function getFiscalConfig(): Promise<FiscalConfig | null | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  const { data, error } = await admin
    .from('clinic_fiscal_config')
    .select('emits_nfse, is_active, environment, provider, cnpj, inscricao_municipal, razao_social, regime_tributario, optante_simples, codigo_municipio, cnae, item_lista_servico, codigo_tributario_municipio, iss_aliquota, iss_retido, rps_serie, rps_proximo_numero, rps_lote, focus_token_sandbox, focus_token_production')
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (error) {
    // Tabela ainda não migrada no ambiente → trata como "sem config"
    return null
  }
  if (!data) return null
  const { focus_token_sandbox, focus_token_production, ...rest } = data as any
  return {
    ...rest,
    iss_aliquota: rest.iss_aliquota === null ? null : Number(rest.iss_aliquota),
    has_token_sandbox:    Boolean(focus_token_sandbox && String(focus_token_sandbox).trim()),
    has_token_production: Boolean(focus_token_production && String(focus_token_production).trim()),
  } as FiscalConfig
}

// ─── upsertFiscalConfig ───────────────────────────────────────────────────────
// Grava (cria ou atualiza) a config fiscal do tenant. Tokens só são gravados
// quando vierem preenchidos (string não-vazia) — assim a UI nunca precisa
// reenviar o token a cada salvar. NUNCA retorna o token.

export async function upsertFiscalConfig(
  input: FiscalConfigInput,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  // Apenas chaves presentes entram no patch (undefined = não mexe).
  const patch: Record<string, unknown> = { clinic_id }
  const assign = (k: keyof FiscalConfigInput) => {
    if (input[k] !== undefined) patch[k] = input[k]
  }
  ;([
    'emits_nfse', 'is_active', 'environment', 'cnpj', 'inscricao_municipal',
    'razao_social', 'regime_tributario', 'optante_simples', 'codigo_municipio',
    'cnae', 'item_lista_servico', 'codigo_tributario_municipio', 'iss_aliquota',
    'iss_retido', 'rps_serie', 'rps_proximo_numero', 'rps_lote',
  ] as Array<keyof FiscalConfigInput>).forEach(assign)

  // Tokens: só grava se string não-vazia (mantém o existente caso contrário).
  if (input.focus_token_sandbox && input.focus_token_sandbox.trim()) {
    patch.focus_token_sandbox = input.focus_token_sandbox.trim()
  }
  if (input.focus_token_production && input.focus_token_production.trim()) {
    patch.focus_token_production = input.focus_token_production.trim()
  }

  const { error } = await admin
    .from('clinic_fiscal_config')
    .upsert(patch, { onConflict: 'clinic_id' })
  if (error) return { error: 'Erro ao salvar configuração fiscal: ' + error.message }

  return { success: true }
}

// ─── validateForNfse (prestador + tomador) ────────────────────────────────────
// Reúne os impedimentos do PRESTADOR (config fiscal) e do TOMADOR (tutor) antes
// de qualquer emissão. Não dispara HTTP.

export async function validateForNfse(tutorId: string): Promise<NfseValidation | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const blocks: string[] = []

  const cfg = await getFiscalConfig()
  if (cfg && !('error' in cfg)) {
    if (!cfg) blocks.push('Configuração fiscal não preenchida')
    else {
      if (!cfg.cnpj)                blocks.push('CNPJ do prestador')
      if (!cfg.inscricao_municipal) blocks.push('Inscrição municipal')
      if (!cfg.codigo_municipio)    blocks.push('Código do município (IBGE)')
      if (!cfg.item_lista_servico)  blocks.push('Item da lista de serviço (LC 116)')
      if (cfg.iss_aliquota === null) blocks.push('Alíquota de ISS')
    }
  } else {
    blocks.push('Configuração fiscal não preenchida')
  }

  // Tomador (tutor) — reusa a validação do módulo de faturamento
  const { validateTutorForNfse } = await import('./billing-documents')
  const tv = await validateTutorForNfse(tutorId)
  if (!('error' in tv)) {
    for (const m of tv.missing) blocks.push(`Tutor: ${m}`)
  }

  return { valid: blocks.length === 0, blocks }
}

// ─── buildNfsePayload ─────────────────────────────────────────────────────────
// Monta o payload Focus NFe a partir de um billing_document (orçamento/nfse) +
// config fiscal + cadastro do tutor. PURO em espírito (sem efeitos colaterais),
// mas async porque lê do banco. Não envia nada.

export async function buildNfsePayload(
  billingDocumentId: string,
): Promise<{ payload: FocusNfsePayload; ref: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data: doc } = await admin
    .from('billing_documents')
    .select('id, doc_number, total_amount, tutor_id, issue_date')
    .eq('id', billingDocumentId).eq('clinic_id', clinic_id).maybeSingle()
  if (!doc) return { error: 'Documento não encontrado.' }
  if (!doc.tutor_id) return { error: 'Documento sem tutor — NFS-e exige tomador.' }

  const cfg = await getFiscalConfig()
  if (!cfg || 'error' in cfg) return { error: 'Configuração fiscal ausente.' }
  if (!cfg.cnpj || !cfg.inscricao_municipal || !cfg.codigo_municipio || !cfg.item_lista_servico || cfg.iss_aliquota === null) {
    return { error: 'Configuração fiscal incompleta.' }
  }

  const { data: tutor } = await admin
    .from('tutors')
    .select('name, cpf, email, cep, street, address, address_number, address_complement, neighborhood, city, state')
    .eq('id', doc.tutor_id).eq('clinic_id', clinic_id).maybeSingle()
  if (!tutor) return { error: 'Tutor não encontrado.' }

  const { data: items } = await admin
    .from('billing_document_items')
    .select('description, quantity, unit_price')
    .eq('document_id', billingDocumentId)
    .order('sort_order', { ascending: true })

  const discriminacao = (items ?? [])
    .map((it: any) => `${Number(it.quantity)}x ${it.description} (${Number(it.unit_price).toFixed(2)})`)
    .join(' | ') || 'Serviços veterinários'

  const onlyDigits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '')
  const cpfDigits = onlyDigits(tutor.cpf)

  const payload: FocusNfsePayload = {
    data_emissao: (doc.issue_date as string) ?? new Date().toISOString(),
    prestador: {
      cnpj:                onlyDigits(cfg.cnpj),
      inscricao_municipal: cfg.inscricao_municipal,
      codigo_municipio:    cfg.codigo_municipio,
    },
    tomador: {
      ...(cpfDigits.length > 11 ? { cnpj: cpfDigits } : { cpf: cpfDigits }),
      razao_social: (tutor.name as string) ?? 'Consumidor',
      email:        (tutor.email as string) || undefined,
      endereco: {
        logradouro:       (tutor.street as string) || (tutor.address as string) || '',
        numero:           (tutor.address_number as string) || 'S/N',
        complemento:      (tutor.address_complement as string) || undefined,
        bairro:           (tutor.neighborhood as string) || '',
        codigo_municipio: cfg.codigo_municipio,
        uf:               (tutor.state as string) || '',
        cep:              onlyDigits(tutor.cep),
      },
    },
    servico: {
      aliquota:           cfg.iss_aliquota,
      discriminacao,
      iss_retido:         cfg.iss_retido,
      item_lista_servico: cfg.item_lista_servico,
      codigo_tributario_municipio: cfg.codigo_tributario_municipio || undefined,
      valor_servicos:     Number(doc.total_amount),
    },
  }

  // ref idempotente do Focus NFe (único por emissão). Usa o número do doc.
  const ref = `vetmax-${clinic_id.slice(0, 8)}-${doc.doc_number}`.replace(/[^a-zA-Z0-9-]/g, '-')
  return { payload, ref }
}

// ─── Mapeamento de status Focus NFe → status interno do documento ─────────────
// Focus NFe devolve: processando_autorizacao | autorizado | cancelado |
// erro_autorizacao. Mapeamos para o BillingStatus de nfse (processing/authorized/
// rejected). 'cancelado' tratamos como rejected p/ a UI (fora de escopo cancelar).
function mapFocusStatus(focusStatus: string | undefined): 'processing' | 'authorized' | 'rejected' {
  switch (focusStatus) {
    case 'autorizado':              return 'authorized'
    case 'erro_autorizacao':
    case 'cancelado':               return 'rejected'
    case 'processando_autorizacao':
    default:                        return 'processing'
  }
}

/** Grava os campos fiscais retornados pelo provedor no billing_document. */
async function persistNfseResult(
  admin: Ctx['admin'], clinic_id: string, billingDocumentId: string,
  ref: string, body: any,
): Promise<void> {
  const status = mapFocusStatus(body?.status)
  await admin.from('billing_documents').update({
    status,
    nfse_ref:                ref,
    nfse_numero:             body?.numero ?? body?.numero_rps ?? null,
    nfse_codigo_verificacao: body?.codigo_verificacao ?? null,
    nfse_provider_status:    body?.status ?? null,
    nfse_url:                body?.url ?? body?.caminho_xml_nota_fiscal ?? null,
  }).eq('id', billingDocumentId).eq('clinic_id', clinic_id)
}

// ─── emitNfse — emissão real (Focus NFe) ──────────────────────────────────────
// POST /v2/nfse?ref= com Basic auth (usuário=token, senha vazia). Focus responde
// 202 (em processamento) — a confirmação chega depois via consultNfse (polling)
// ou webhook. Persiste ref+status no documento para acompanhamento.

export async function emitNfse(
  billingDocumentId: string,
): Promise<{ ref: string; status: string } | { error: string; payload?: FocusNfsePayload }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const built = await buildNfsePayload(billingDocumentId)
  if ('error' in built) return built
  const { payload, ref } = built

  // Lê config COM token (apenas server-side; nunca retorna o token).
  const { data: cfg } = await admin
    .from('clinic_fiscal_config')
    .select('emits_nfse, is_active, environment, focus_token_sandbox, focus_token_production')
    .eq('clinic_id', clinic_id).maybeSingle()

  if (!cfg || !cfg.emits_nfse || !cfg.is_active) {
    return { error: 'Emissão de NFS-e não está ativa para esta clínica.', payload }
  }
  const env   = (cfg.environment === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production'
  const token = env === 'production' ? cfg.focus_token_production : cfg.focus_token_sandbox
  if (!token) {
    return { error: 'Token do Focus NFe não configurado para o ambiente selecionado.', payload }
  }

  const targetUrl = `${FOCUS_NFE_ENDPOINTS[env]}${focusNfsePath(ref)}`
  const authHeader = 'Basic ' + Buffer.from(`${token}:`).toString('base64')

  let res: Response
  try {
    res = await fetch(targetUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body:    JSON.stringify(payload),
      cache:   'no-store',
    })
  } catch (e) {
    return { error: 'Falha de rede ao contatar o provedor de NFS-e: ' + (e instanceof Error ? e.message : 'erro'), payload }
  }

  let body: any = null
  try { body = await res.json() } catch { /* corpo vazio em alguns 202 */ }

  // 422 = erro de validação do provedor (campos fiscais). 4xx demais idem.
  if (res.status >= 400) {
    const msg = body?.mensagem || body?.erros?.[0]?.mensagem || body?.codigo || `HTTP ${res.status}`
    await admin.from('billing_documents').update({
      status: 'rejected', nfse_ref: ref, nfse_provider_status: body?.status ?? `erro_${res.status}`,
    }).eq('id', billingDocumentId).eq('clinic_id', clinic_id)
    return { error: 'Provedor rejeitou a NFS-e: ' + msg, payload }
  }

  // 202 (processando) ou 200 (já autorizado em sandbox) — persiste e devolve.
  await persistNfseResult(admin, clinic_id, billingDocumentId, ref, body)
  return { ref, status: body?.status ?? 'processando_autorizacao' }
}

// ─── consultNfse — consulta de status (Focus NFe) ─────────────────────────────
// GET /v2/nfse?ref= com Basic auth. Atualiza o documento (por ref) com o status
// mais recente. Usada para polling pós-emissão.

export async function consultNfse(
  ref: string,
): Promise<{ status: string; numero?: string | null; url?: string | null } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  if (!ref) return { error: 'ref obrigatório.' }

  const { data: doc } = await admin
    .from('billing_documents')
    .select('id')
    .eq('clinic_id', clinic_id).eq('nfse_ref', ref).maybeSingle()
  if (!doc) return { error: 'Documento da NFS-e não encontrado para este ref.' }

  const { data: cfg } = await admin
    .from('clinic_fiscal_config')
    .select('environment, focus_token_sandbox, focus_token_production')
    .eq('clinic_id', clinic_id).maybeSingle()
  if (!cfg) return { error: 'Configuração fiscal ausente.' }
  const env   = (cfg.environment === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production'
  const token = env === 'production' ? cfg.focus_token_production : cfg.focus_token_sandbox
  if (!token) return { error: 'Token do Focus NFe não configurado.' }

  const targetUrl = `${FOCUS_NFE_ENDPOINTS[env]}${focusNfsePath(ref)}`
  const authHeader = 'Basic ' + Buffer.from(`${token}:`).toString('base64')

  let res: Response
  try {
    res = await fetch(targetUrl, { method: 'GET', headers: { Authorization: authHeader }, cache: 'no-store' })
  } catch (e) {
    return { error: 'Falha de rede ao consultar a NFS-e: ' + (e instanceof Error ? e.message : 'erro') }
  }
  let body: any = null
  try { body = await res.json() } catch { /* */ }
  if (res.status >= 400) {
    return { error: 'Erro ao consultar NFS-e: ' + (body?.mensagem || `HTTP ${res.status}`) }
  }

  await persistNfseResult(admin, clinic_id, doc.id as string, ref, body)
  return { status: body?.status ?? 'processando_autorizacao', numero: body?.numero ?? null, url: body?.url ?? null }
}

// ─── emitNfseForConsultation — orquestrador do Caixa ──────────────────────────
// Cria o documento NFS-e a partir dos serviços da consulta e dispara a emissão
// no provedor. É o ponto que o CheckoutModal chama ao confirmar "Emitir NFS-e?".

export async function emitNfseForConsultation(
  consultationId: string,
): Promise<{ ref: string; status: string; doc_number: string } | { error: string }> {
  const { createNfseDocumentForConsultation } = await import('./billing-documents')
  const created = await createNfseDocumentForConsultation(consultationId)
  if ('error' in created) return created

  const emitted = await emitNfse(created.id)
  if ('error' in emitted) return { error: emitted.error }
  return { ref: emitted.ref, status: emitted.status, doc_number: created.doc_number }
}
