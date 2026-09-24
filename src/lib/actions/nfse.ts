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
  nfse_auto_checkout:  boolean
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
  nfse_auto_checkout?:  boolean
  /** Quando presente (string não-vazia), atualiza o token do ambiente. */
  focus_token_sandbox?:    string
  focus_token_production?: string
}

/** Config fiscal de uma empresa faturante (NFS-e por CNPJ). Sem tokens (segurança). */
export interface CompanyFiscalConfig {
  company_id:          string
  company_name:        string
  company_code:        string | null
  cnpj:                string | null   // identidade (vem de companies)
  inscricao_municipal: string | null   // identidade (vem de companies)
  emits_nfse:          boolean
  is_active:           boolean
  environment:         'sandbox' | 'production'
  regime_tributario:   string | null
  optante_simples:     boolean
  codigo_municipio:    string | null
  cnae:                string | null
  item_lista_servico:  string | null
  codigo_tributario_municipio: string | null
  iss_aliquota:        number | null
  iss_retido:          boolean
  has_token_sandbox:    boolean
  has_token_production: boolean
}

export interface CompanyFiscalConfigInput {
  company_id:           string
  emits_nfse?:          boolean
  is_active?:           boolean
  environment?:         'sandbox' | 'production'
  regime_tributario?:   string | null
  optante_simples?:     boolean
  codigo_municipio?:    string | null
  cnae?:                string | null
  item_lista_servico?:  string | null
  codigo_tributario_municipio?: string | null
  iss_aliquota?:        number | null
  iss_retido?:          boolean
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
    .select('emits_nfse, is_active, environment, provider, cnpj, inscricao_municipal, razao_social, regime_tributario, optante_simples, codigo_municipio, cnae, item_lista_servico, codigo_tributario_municipio, iss_aliquota, iss_retido, rps_serie, rps_proximo_numero, rps_lote, nfse_auto_checkout, focus_token_sandbox, focus_token_production')
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
    'iss_retido', 'rps_serie', 'rps_proximo_numero', 'rps_lote', 'nfse_auto_checkout',
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

// ─── Config fiscal EFETIVA por empresa faturante (resolver) ───────────────────
// Se a empresa tem config própria ativa (company_fiscal_config), usa-a — a
// IDENTIDADE (CNPJ/inscrição) vem de companies. Senão, cai para a config da
// clínica (clinic_fiscal_config). Retrocompat total p/ clínicas de 1 CNPJ.

type ResolvedFiscal = {
  emits:               boolean
  active:              boolean
  environment:         'sandbox' | 'production'
  token:               string | null
  prestador:           { cnpj: string | null; inscricao_municipal: string | null; codigo_municipio: string | null }
  iss_aliquota:        number | null
  iss_retido:          boolean
  item_lista_servico:  string | null
  codigo_tributario_municipio: string | null
  source:              'company' | 'clinic'
}

async function resolveFiscalForCompany(
  admin: Ctx['admin'], clinic_id: string, company_id: string | null,
): Promise<ResolvedFiscal | { error: string }> {
  if (company_id) {
    const { data: cc } = await admin
      .from('company_fiscal_config')
      .select('emits_nfse, is_active, environment, focus_token_sandbox, focus_token_production, codigo_municipio, item_lista_servico, codigo_tributario_municipio, iss_aliquota, iss_retido')
      .eq('clinic_id', clinic_id).eq('company_id', company_id).maybeSingle()
    if (cc && cc.emits_nfse) {
      const { data: comp } = await admin
        .from('companies')
        .select('cnpj, municipal_registration')
        .eq('id', company_id).maybeSingle()
      const env = (cc.environment === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production'
      return {
        emits: Boolean(cc.emits_nfse),
        active: Boolean(cc.is_active),
        environment: env,
        token: (env === 'production' ? cc.focus_token_production : cc.focus_token_sandbox) ?? null,
        prestador: {
          cnpj: (comp?.cnpj as string | null) ?? null,
          inscricao_municipal: (comp?.municipal_registration as string | null) ?? null,
          codigo_municipio: cc.codigo_municipio ?? null,
        },
        iss_aliquota: cc.iss_aliquota === null ? null : Number(cc.iss_aliquota),
        iss_retido: Boolean(cc.iss_retido),
        item_lista_servico: cc.item_lista_servico ?? null,
        codigo_tributario_municipio: cc.codigo_tributario_municipio ?? null,
        source: 'company',
      }
    }
  }
  // Fallback: config por clínica
  const { data: cfg } = await admin
    .from('clinic_fiscal_config')
    .select('emits_nfse, is_active, environment, cnpj, inscricao_municipal, codigo_municipio, item_lista_servico, codigo_tributario_municipio, iss_aliquota, iss_retido, focus_token_sandbox, focus_token_production')
    .eq('clinic_id', clinic_id).maybeSingle()
  if (!cfg) return { error: 'Configuração fiscal ausente.' }
  const env = (cfg.environment === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production'
  return {
    emits: Boolean(cfg.emits_nfse),
    active: Boolean(cfg.is_active),
    environment: env,
    token: (env === 'production' ? cfg.focus_token_production : cfg.focus_token_sandbox) ?? null,
    prestador: {
      cnpj: (cfg.cnpj as string | null) ?? null,
      inscricao_municipal: (cfg.inscricao_municipal as string | null) ?? null,
      codigo_municipio: cfg.codigo_municipio ?? null,
    },
    iss_aliquota: cfg.iss_aliquota === null ? null : Number(cfg.iss_aliquota),
    iss_retido: Boolean(cfg.iss_retido),
    item_lista_servico: cfg.item_lista_servico ?? null,
    codigo_tributario_municipio: cfg.codigo_tributario_municipio ?? null,
    source: 'clinic',
  }
}

// ─── CRUD da config fiscal POR EMPRESA (tela de Empresas Faturantes) ──────────
// Lista as empresas faturantes com sua config fiscal (sem tokens). A UI mostra
// uma seção "Fiscal (NFS-e)" por empresa.
export async function listCompanyFiscalConfigs(): Promise<CompanyFiscalConfig[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data: comps } = await admin
    .from('companies')
    .select('id, code, name, legal_name, cnpj, municipal_registration, is_active')
    .eq('clinic_id', clinic_id)
    .order('code', { ascending: true })
  if (!comps || comps.length === 0) return []

  const { data: cfgs } = await admin
    .from('company_fiscal_config')
    .select('company_id, emits_nfse, is_active, environment, regime_tributario, optante_simples, codigo_municipio, cnae, item_lista_servico, codigo_tributario_municipio, iss_aliquota, iss_retido, focus_token_sandbox, focus_token_production')
    .eq('clinic_id', clinic_id)
  const byCompany = new Map<string, any>()
  for (const c of cfgs ?? []) byCompany.set((c as any).company_id, c)

  return (comps as any[]).map(comp => {
    const c = byCompany.get(comp.id)
    return {
      company_id:          comp.id,
      company_name:        comp.name ?? comp.legal_name ?? '—',
      company_code:        comp.code ?? null,
      cnpj:                comp.cnpj ?? null,
      inscricao_municipal: comp.municipal_registration ?? null,
      emits_nfse:          Boolean(c?.emits_nfse),
      is_active:           Boolean(c?.is_active),
      environment:         (c?.environment === 'production' ? 'production' : 'sandbox') as 'sandbox' | 'production',
      regime_tributario:   c?.regime_tributario ?? null,
      optante_simples:     Boolean(c?.optante_simples),
      codigo_municipio:    c?.codigo_municipio ?? null,
      cnae:                c?.cnae ?? null,
      item_lista_servico:  c?.item_lista_servico ?? null,
      codigo_tributario_municipio: c?.codigo_tributario_municipio ?? null,
      iss_aliquota:        c?.iss_aliquota === null || c?.iss_aliquota === undefined ? null : Number(c.iss_aliquota),
      iss_retido:          Boolean(c?.iss_retido),
      has_token_sandbox:    Boolean(c?.focus_token_sandbox && String(c.focus_token_sandbox).trim()),
      has_token_production: Boolean(c?.focus_token_production && String(c.focus_token_production).trim()),
    } as CompanyFiscalConfig
  })
}

export async function upsertCompanyFiscalConfig(
  input: CompanyFiscalConfigInput,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx
  if (!input.company_id) return { error: 'Empresa obrigatória.' }

  // Garante que a empresa pertence à clínica
  const { data: comp } = await admin
    .from('companies').select('id').eq('id', input.company_id).eq('clinic_id', clinic_id).maybeSingle()
  if (!comp) return { error: 'Empresa não encontrada.' }

  const patch: Record<string, unknown> = { clinic_id, company_id: input.company_id }
  const assign = (k: keyof CompanyFiscalConfigInput) => { if (input[k] !== undefined) patch[k] = input[k] }
  ;([
    'emits_nfse', 'is_active', 'environment', 'regime_tributario', 'optante_simples',
    'codigo_municipio', 'cnae', 'item_lista_servico', 'codigo_tributario_municipio',
    'iss_aliquota', 'iss_retido',
  ] as Array<keyof CompanyFiscalConfigInput>).forEach(assign)

  if (input.focus_token_sandbox && input.focus_token_sandbox.trim())    patch.focus_token_sandbox = input.focus_token_sandbox.trim()
  if (input.focus_token_production && input.focus_token_production.trim()) patch.focus_token_production = input.focus_token_production.trim()

  const { error } = await admin
    .from('company_fiscal_config')
    .upsert(patch, { onConflict: 'company_id' })
  if (error) return { error: 'Erro ao salvar configuração fiscal da empresa: ' + error.message }
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
      if (cfg.iss_aliquota === null) blocks.push('Alíquota de ISS')
      // Item LC116 agora é por serviço (cadastro do serviço), não da config.
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
    .select('id, doc_number, total_amount, tutor_id, issue_date, company_id')
    .eq('id', billingDocumentId).eq('clinic_id', clinic_id).maybeSingle()
  if (!doc) return { error: 'Documento não encontrado.' }
  if (!doc.tutor_id) return { error: 'Documento sem tutor — NFS-e exige tomador.' }

  // Config fiscal EFETIVA da empresa faturante da nota (fallback = clínica).
  const cfg = await resolveFiscalForCompany(admin, clinic_id, (doc.company_id as string | null) ?? null)
  if ('error' in cfg) return { error: cfg.error }
  // Alíquota ISS e dados do prestador vêm da config. O item LC116 e o código
  // tributário do município vêm do CADASTRO DO SERVIÇO (resolvidos abaixo; com
  // fallback para o item_lista_servico padrão da config).
  if (!cfg.prestador.cnpj || !cfg.prestador.inscricao_municipal || !cfg.prestador.codigo_municipio || cfg.iss_aliquota === null) {
    return { error: 'Configuração fiscal incompleta (CNPJ, inscrição municipal, código do município e alíquota ISS).' }
  }

  const { data: tutor } = await admin
    .from('tutors')
    .select('name, cpf, email, cep, street, address, address_number, address_complement, neighborhood, city, state')
    .eq('id', doc.tutor_id).eq('clinic_id', clinic_id).maybeSingle()
  if (!tutor) return { error: 'Tutor não encontrado.' }

  const { data: items } = await admin
    .from('billing_document_items')
    .select('stock_item_id, description, quantity, unit_price')
    .eq('document_id', billingDocumentId)
    .order('sort_order', { ascending: true })

  const discriminacao = (items ?? [])
    .map((it: any) => `${Number(it.quantity)}x ${it.description} (${Number(it.unit_price).toFixed(2)})`)
    .join(' | ') || 'Serviços veterinários'

  // Resolve o item LC116 + código tributário a partir dos serviços (stock_items).
  // A NFS-e v2 do provedor carrega UM bloco de serviço; quando os itens têm
  // códigos distintos, vence o de maior valor (predominante). Limitação conhecida:
  // serviços com LC116 divergentes idealmente seriam notas separadas (melhoria futura).
  const stockIds = Array.from(new Set((items ?? []).map((it: any) => it.stock_item_id).filter(Boolean)))
  const codeByStock = new Map<string, { item: string | null; cod: string | null }>()
  if (stockIds.length > 0) {
    const { data: stocks } = await admin
      .from('stock_items')
      .select('id, nfse_item_lista_servico, nfse_codigo_tributario_municipio')
      .eq('clinic_id', clinic_id)
      .in('id', stockIds)
    for (const s of stocks ?? []) {
      codeByStock.set((s as any).id, {
        item: (s as any).nfse_item_lista_servico ?? null,
        cod:  (s as any).nfse_codigo_tributario_municipio ?? null,
      })
    }
  }
  const valueByItemCode = new Map<string, number>()
  const codMunByItemCode = new Map<string, string | null>()
  for (const it of items ?? []) {
    const code = codeByStock.get((it as any).stock_item_id)?.item
    if (!code) continue
    const val = Number((it as any).quantity ?? 1) * Number((it as any).unit_price ?? 0)
    valueByItemCode.set(code, (valueByItemCode.get(code) ?? 0) + val)
    if (!codMunByItemCode.has(code)) codMunByItemCode.set(code, codeByStock.get((it as any).stock_item_id)?.cod ?? null)
  }
  let itemListaServico: string | null = null
  let codigoTributarioMunicipio: string | null = null
  let topValue = -1
  for (const [code, val] of valueByItemCode) {
    if (val > topValue) { topValue = val; itemListaServico = code; codigoTributarioMunicipio = codMunByItemCode.get(code) ?? null }
  }
  if (!itemListaServico) {
    // Fallback: item padrão da config fiscal (empresa ou clínica).
    itemListaServico = cfg.item_lista_servico
    codigoTributarioMunicipio = cfg.codigo_tributario_municipio
  }
  if (!itemListaServico) {
    return { error: 'Nenhum serviço desta nota tem o "Item da Lista de Serviço (LC 116)" preenchido. Defina-o no cadastro do serviço ou na configuração fiscal.' }
  }

  const onlyDigits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '')
  const cpfDigits = onlyDigits(tutor.cpf)

  const payload: FocusNfsePayload = {
    data_emissao: (doc.issue_date as string) ?? new Date().toISOString(),
    prestador: {
      cnpj:                onlyDigits(cfg.prestador.cnpj),
      inscricao_municipal: cfg.prestador.inscricao_municipal as string,
      codigo_municipio:    cfg.prestador.codigo_municipio as string,
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
        codigo_municipio: cfg.prestador.codigo_municipio as string,
        uf:               (tutor.state as string) || '',
        cep:              onlyDigits(tutor.cep),
      },
    },
    servico: {
      aliquota:           cfg.iss_aliquota,
      discriminacao,
      iss_retido:         cfg.iss_retido,
      item_lista_servico: itemListaServico,
      codigo_tributario_municipio: codigoTributarioMunicipio || undefined,
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

  // Empresa faturante da nota → config fiscal EFETIVA (empresa ou clínica).
  const { data: docRow } = await admin
    .from('billing_documents')
    .select('company_id')
    .eq('id', billingDocumentId).eq('clinic_id', clinic_id).maybeSingle()
  const cfg = await resolveFiscalForCompany(admin, clinic_id, (docRow?.company_id as string | null) ?? null)
  if ('error' in cfg) return { error: cfg.error, payload }

  if (!cfg.emits || !cfg.active) {
    return { error: 'Emissão de NFS-e não está ativa para esta empresa/clínica.', payload }
  }
  const env   = cfg.environment
  const token = cfg.token
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
    .select('id, company_id')
    .eq('clinic_id', clinic_id).eq('nfse_ref', ref).maybeSingle()
  if (!doc) return { error: 'Documento da NFS-e não encontrado para este ref.' }

  const cfg = await resolveFiscalForCompany(admin, clinic_id, (doc.company_id as string | null) ?? null)
  if ('error' in cfg) return { error: cfg.error }
  const env   = cfg.environment
  const token = cfg.token
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

export interface NfseEmissionResult {
  company_name: string
  doc_number:   string
  ref?:         string
  status?:      string
  error?:       string
}

export async function emitNfseForConsultation(
  consultationId: string,
): Promise<{ results: NfseEmissionResult[] } | { error: string }> {
  // Trava CFMV/fiscal (council 2026-08-10): a NFS-e é documento fiscal e precisa
  // de lastro clínico IMUTÁVEL. Cobrar o tutor no caixa pode ocorrer antes da
  // assinatura (fluxo "Enviar ao caixa sem finalizar"), mas emitir a NOTA exige
  // o prontuário assinado — senão a nota referenciaria um registro ainda editável.
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { data: consult } = await ctx.admin
    .from('consultations')
    .select('is_reviewed_by_vet')
    .eq('id', consultationId)
    .eq('clinic_id', ctx.clinic_id)
    .maybeSingle()
  if (!consult) return { error: 'Consulta não encontrada.' }
  if (!consult.is_reviewed_by_vet) {
    return { error: 'NFS-e só pode ser emitida após a finalização e assinatura do prontuário (CFMV). Finalize a consulta ("Dar Alta") antes de emitir a nota fiscal.' }
  }

  // Uma nota POR EMPRESA FATURANTE presente na OS (desmembramento por CNPJ).
  const { createNfseDocumentsForConsultation } = await import('./billing-documents')
  const created = await createNfseDocumentsForConsultation(consultationId)
  if ('error' in created) return created
  if (created.length === 0) return { error: 'Consulta sem serviços para emitir NFS-e.' }

  const results: NfseEmissionResult[] = []
  for (const d of created) {
    const emitted = await emitNfse(d.id)
    if ('error' in emitted) {
      results.push({ company_name: d.company_name, doc_number: d.doc_number, error: emitted.error })
    } else {
      results.push({ company_name: d.company_name, doc_number: d.doc_number, ref: emitted.ref, status: emitted.status })
    }
  }
  return { results }
}
