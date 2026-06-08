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
  codigo_municipio:    string | null
  cnae:                string | null
  item_lista_servico:  string | null
  codigo_tributario_municipio: string | null
  iss_aliquota:        number | null
  iss_retido:          boolean
  rps_serie:           string | null
  rps_proximo_numero:  number
  rps_lote:            number
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
    .select('emits_nfse, is_active, environment, provider, cnpj, inscricao_municipal, razao_social, codigo_municipio, cnae, item_lista_servico, codigo_tributario_municipio, iss_aliquota, iss_retido, rps_serie, rps_proximo_numero, rps_lote')
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (error) {
    // Tabela ainda não migrada no ambiente → trata como "sem config"
    return null
  }
  if (!data) return null
  return {
    ...data,
    iss_aliquota: data.iss_aliquota === null ? null : Number(data.iss_aliquota),
  } as FiscalConfig
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

// ─── emitNfse (STUB — Fase 3) ─────────────────────────────────────────────────
// Emissão real. Hoje monta o payload e VALIDA, mas a chamada HTTP fica atrás de
// uma guarda: sem token configurado em clinic_fiscal_config, retorna erro
// instrutivo em vez de tentar a rede. Quando o PO liberar a Fase 3 e o token
// estiver salvo, troca-se a guarda pela chamada fetch (Basic auth com o token).

export async function emitNfse(
  billingDocumentId: string,
): Promise<{ ref: string; status: 'queued' } | { error: string; payload?: FocusNfsePayload }> {
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
  const token = cfg.environment === 'production' ? cfg.focus_token_production : cfg.focus_token_sandbox
  if (!token) {
    return { error: 'Token do Focus NFe não configurado para o ambiente selecionado.', payload }
  }

  // URL-alvo do provedor já resolvida (endpoint + recurso por ref idempotente).
  const targetUrl = `${FOCUS_NFE_ENDPOINTS[cfg.environment as 'sandbox' | 'production']}${focusNfsePath(ref)}`

  // ── Guarda da Fase 3 ──────────────────────────────────────────────────────
  // A chamada HTTP real será habilitada quando o PO liberar a emissão. Mantida
  // como referência (Basic auth: usuário=token, senha vazia):
  //
  //   const res = await fetch(targetUrl, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //       Authorization: 'Basic ' + Buffer.from(`${token}:`).toString('base64'),
  //     },
  //     body: JSON.stringify(payload),
  //   })
  //   ... tratar 202 (em processamento) / 422 (erro) e gravar nfse_ref/status ...
  //
  void targetUrl // referenciado para a Fase 3 (evita import órfão)
  return { error: 'Emissão real desabilitada (Fase 3 não liberada). Payload validado e pronto.', payload }
}

// ─── consultNfse (STUB — Fase 3) ──────────────────────────────────────────────
// Consulta o status de uma emissão pelo ref (GET /v2/nfse?ref=). Mesma guarda.

export async function consultNfse(
  ref: string,
): Promise<{ status: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!ref) return { error: 'ref obrigatório.' }
  return { error: 'Consulta real desabilitada (Fase 3 não liberada).' }
}
