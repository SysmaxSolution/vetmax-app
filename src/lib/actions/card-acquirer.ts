'use server'

// Configuração e operação da adquirente de cartão por EMPRESA FATURANTE.
//
// A regra da Clínica Animais, confirmada com a Aline, é por CNPJ: a Develey
// (Diagnóstico/Imagem) usa FinPet com split do profissional; Laboratório e
// Clínica usam Sipag própria. Por isso a configuração mora em `companies`, não
// em `clinics` — no caixa, a máquina é escolhida pela empresa do item.
//
// As credenciais são DO ESTABELECIMENTO, não nossas: a própria documentação da
// EvoluServices manda o parceiro criar uma tela para o cliente colar a chave.
// Elas entram cifradas e NUNCA voltam para o navegador — as leituras dizem
// apenas SE existem.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'crypto'
import { mensagemErro } from '@/lib/errors'
import { logAudit } from './audit'
import { encryptSecret, decryptSecret } from '@/lib/integrations/bank-certificate'
import {
  baseDoAmbiente, obterToken, listarTerminais, listarBeneficiarios,
  criarLink, consultarOrder, consultarMetodosDePagamento,
  criarTransacaoRemota, cancelarTransacaoRemota,
  type CredenciaisEvolu,
} from '@/lib/integrations/evoluservices'
import { STATUS_TERMINAL, BANDEIRAS, lerSituacao } from '@/lib/integrations/evoluservices-erros'
import { validarSplit, comissaoEmValor } from '@/lib/integrations/evoluservices-valores'
import type {
  ConfigAdquirente, TerminalDisponivel, BeneficiarioDisponivel,
  OpcoesDeCobranca, CobrancaCriada, LinhaExtratoCartao, AndamentoCobranca,
} from '@/types/card-acquirer'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' as const }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' as const }
  return { admin, clinicId: profile.clinic_id as string, role: (profile.role as string) ?? 'staff', userId: user.id }
}

const EH_GESTAO = (role: string) => ['admin', 'owner', 'manager'].includes(role)

/** Monta as credenciais decifradas de uma empresa. */
async function credenciaisDaEmpresa(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  companyId: string,
): Promise<{ cred: CredenciaisEvolu; token: string | null; cfgId: string } | { error: string }> {
  const { data: cfg } = await admin
    .from('company_card_acquirer')
    .select('company_id, enabled, environment, merchant_id, api_username, api_key_encrypted, basic_auth_encrypted, token_cache, token_expires_at')
    .eq('company_id', companyId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (!cfg) return { error: 'Esta empresa não tem adquirente de cartão configurada.' }
  if (!cfg.enabled) return { error: 'A cobrança por cartão está desligada para esta empresa.' }

  const apiKey = decryptSecret(cfg.api_key_encrypted as string | null)?.toString('utf8') ?? null
  if (!apiKey || !cfg.api_username || !cfg.merchant_id) {
    return { error: 'A configuração da operadora está incompleta nesta empresa.' }
  }

  // Token vale 92 dias; reusa enquanto houver folga de um dia.
  const expira = cfg.token_expires_at ? new Date(cfg.token_expires_at as string) : null
  const aindaVale = expira ? expira.getTime() - Date.now() > 86_400_000 : false

  return {
    cred: {
      base:       baseDoAmbiente(cfg.environment as string),
      username:   cfg.api_username as string,
      apiKey,
      merchantId: cfg.merchant_id as string,
      basicAuth:  decryptSecret(cfg.basic_auth_encrypted as string | null)?.toString('utf8') ?? null,
    },
    token:  aindaVale ? (cfg.token_cache as string | null) : null,
    cfgId:  cfg.company_id as string,
  }
}

/** Guarda o token renovado, para não autenticar a cada chamada. */
async function guardarToken(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  token: string,
  expiraEm: Date | null,
) {
  await admin.from('company_card_acquirer')
    .update({ token_cache: token, token_expires_at: expiraEm?.toISOString() ?? null })
    .eq('company_id', companyId)
}

// ─── Configuração ───────────────────────────────────────────────────────────

/** Configuração de cartão de todas as empresas faturantes da clínica. */
export async function listarConfigAdquirente(): Promise<ConfigAdquirente[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!EH_GESTAO(ctx.role)) return { error: 'Acesso restrito à gestão da clínica.' }

  const { data: empresas, error } = await ctx.admin
    .from('companies')
    .select('id, name, cnpj')
    .eq('clinic_id', ctx.clinicId)
    .eq('is_active', true)
    .order('code', { ascending: true })
  if (error) return { error: 'Erro ao listar empresas: ' + mensagemErro(error, 'lib/actions/card-acquirer.ts') }

  const { data: cfgs } = await ctx.admin
    .from('company_card_acquirer')
    .select('company_id, acquirer, enabled, environment, merchant_id, api_username, api_key_encrypted, webhook_secret, default_terminal_id, token_expires_at')
    .eq('clinic_id', ctx.clinicId)

  const porEmpresa = new Map((cfgs ?? []).map(c => [c.company_id as string, c]))
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'

  return (empresas ?? []).map((e): ConfigAdquirente => {
    const c = porEmpresa.get(e.id as string)
    const segredo = c?.webhook_secret as string | null
    return {
      company_id:   e.id as string,
      company_name: e.name as string,
      company_cnpj: (e.cnpj as string | null) ?? null,
      acquirer:     ((c?.acquirer as string) ?? 'evoluservices') as ConfigAdquirente['acquirer'],
      enabled:      c?.enabled === true,
      environment:  ((c?.environment as string) ?? 'sandbox') as ConfigAdquirente['environment'],
      merchant_id:  (c?.merchant_id as string | null) ?? null,
      api_username: (c?.api_username as string | null) ?? null,
      tem_api_key:  Boolean(c?.api_key_encrypted),
      tem_webhook_secret: Boolean(segredo),
      default_terminal_id: (c?.default_terminal_id as string | null) ?? null,
      webhook_url:  segredo ? `${baseUrl}/api/webhooks/evoluservices/${segredo}` : null,
      token_expires_at: (c?.token_expires_at as string | null) ?? null,
    }
  })
}

/**
 * Salva a configuração de uma empresa.
 *
 * A chave entra cifrada e nunca mais sai. Campo em branco significa "não
 * mexer", não "apagar" — senão reabrir a tela e salvar outro campo limparia a
 * credencial sem ninguém perceber.
 */
export async function salvarConfigAdquirente(input: {
  companyId:    string
  acquirer?:    'evoluservices' | 'sipag' | 'outro'
  enabled?:     boolean
  environment?: 'sandbox' | 'production'
  merchantId?:  string | null
  apiUsername?: string | null
  /** Em claro, vindo da tela. Vazio = manter o que já está gravado. */
  apiKey?:      string | null
  basicAuth?:   string | null
  defaultTerminalId?: string | null
}): Promise<{ ok: true; webhook_url: string | null } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!EH_GESTAO(ctx.role)) return { error: 'Só a gestão da clínica pode configurar a operadora de cartão.' }

  const { data: empresa } = await ctx.admin
    .from('companies').select('id, name').eq('id', input.companyId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!empresa) return { error: 'Empresa não encontrada nesta clínica.' }

  const { data: atual } = await ctx.admin
    .from('company_card_acquirer')
    .select('company_id, webhook_secret, api_key_encrypted')
    .eq('company_id', input.companyId).maybeSingle()

  // O segredo do webhook nasce uma vez e não muda: a URL fica cadastrada no
  // portal deles, e trocá-la silenciosamente derrubaria o retorno das vendas.
  const segredo = (atual?.webhook_secret as string | null) ?? randomBytes(24).toString('base64url')

  const patch: Record<string, unknown> = {
    company_id:     input.companyId,
    clinic_id:      ctx.clinicId,
    webhook_secret: segredo,
    updated_at:     new Date().toISOString(),
  }
  if (input.acquirer !== undefined)    patch.acquirer = input.acquirer
  if (input.enabled !== undefined)     patch.enabled = input.enabled
  if (input.environment !== undefined) patch.environment = input.environment
  if (input.merchantId !== undefined)  patch.merchant_id = input.merchantId?.trim() || null
  if (input.apiUsername !== undefined) patch.api_username = input.apiUsername?.trim() || null
  if (input.defaultTerminalId !== undefined) patch.default_terminal_id = input.defaultTerminalId?.trim() || null
  // Em branco = manter. Trocar de ambiente invalida o token em cache.
  if (input.apiKey?.trim())    { patch.api_key_encrypted = encryptSecret(input.apiKey.trim()); patch.token_cache = null; patch.token_expires_at = null }
  if (input.basicAuth?.trim()) patch.basic_auth_encrypted = encryptSecret(input.basicAuth.trim())
  if (input.environment !== undefined) { patch.token_cache = null; patch.token_expires_at = null }

  const { error } = await ctx.admin.from('company_card_acquirer').upsert(patch, { onConflict: 'company_id' })
  if (error) {
    // O CHECK de coerência barra ligar sem credencial completa — e essa é a
    // mensagem que a gestão precisa ler, não o texto do Postgres.
    const cru = mensagemErro(error, 'lib/actions/card-acquirer.ts')
    if (/credencial_check/i.test(cru)) {
      return { error: 'Para ativar, preencha o código do estabelecimento, o usuário e a chave de integração.' }
    }
    return { error: 'Erro ao salvar: ' + cru }
  }

  await logAudit({
    action: 'CARD_ACQUIRER_CONFIG',
    entity_type: 'companies',
    entity_id: input.companyId,
    details: {
      empresa: empresa.name, acquirer: input.acquirer, enabled: input.enabled,
      environment: input.environment, chave_alterada: Boolean(input.apiKey?.trim()),
    },
  })

  revalidatePath('/dashboard/management')
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'
  return { ok: true, webhook_url: `${baseUrl}/api/webhooks/evoluservices/${segredo}` }
}

/** Testa a credencial contra a operadora, sem cobrar nada. */
export async function testarConexaoAdquirente(companyId: string): Promise<{
  ok: true; terminais: number; beneficiarios: number; expira_em: string | null; aviso: string | null
} | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!EH_GESTAO(ctx.role)) return { error: 'Acesso restrito à gestão da clínica.' }

  const c = await credenciaisDaEmpresa(ctx.admin, ctx.clinicId, companyId)
  if ('error' in c) return c

  const t = await obterToken(c.cred)
  if (!t.ok) return { error: t.erro.mensagem }
  await guardarToken(ctx.admin, companyId, t.dados.token, t.dados.expiraEm)

  const [term, benef] = await Promise.all([
    listarTerminais(c.cred, t.dados.token),
    listarBeneficiarios(c.cred, t.dados.token),
  ])

  const terminais = term.ok ? term.dados.length : 0
  const beneficiarios = benef.ok ? benef.dados.length : 0

  // Lista vazia de terminal é o sintoma mais comum e tem causa conhecida —
  // dizer "0 terminais" sem explicar deixaria a gestão sem saber o que fazer.
  const aviso = terminais === 0
    ? 'Credencial válida, mas nenhuma maquininha está registrada. Confira se o programa da operadora está aberto no computador dela e se o terminal foi vinculado no portal.'
    : null

  return { ok: true, terminais, beneficiarios, expira_em: t.dados.expiraEm?.toISOString() ?? null, aviso }
}

/** Terminais da empresa, com o status já traduzido para a recepção. */
export async function listarTerminaisDaEmpresa(companyId: string): Promise<TerminalDisponivel[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const c = await credenciaisDaEmpresa(ctx.admin, ctx.clinicId, companyId)
  if ('error' in c) return c

  const r = await listarTerminais(c.cred, c.token)
  if (r.tokenNovo) await guardarToken(ctx.admin, companyId, r.tokenNovo.token, r.tokenNovo.expiraEm)
  if (!r.ok) return { error: r.erro.mensagem }

  return r.dados.map((t): TerminalDisponivel => {
    const info = STATUS_TERMINAL[t.terminalStatus] ?? {
      rotulo: t.terminalStatus, pode_cobrar: false,
      explicacao: 'Estado não reconhecido — confira no portal da operadora.',
    }
    return {
      terminalId: t.terminalId, terminalStatus: t.terminalStatus,
      rotulo: info.rotulo, pode_cobrar: info.pode_cobrar, explicacao: info.explicacao,
      computerName: t.computerName, macAddress: t.macAddress,
    }
  })
}

/** Beneficiários de split, já cruzados com os profissionais do sistema. */
export async function listarBeneficiariosDaEmpresa(companyId: string): Promise<BeneficiarioDisponivel[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!EH_GESTAO(ctx.role)) return { error: 'Acesso restrito à gestão da clínica.' }

  const c = await credenciaisDaEmpresa(ctx.admin, ctx.clinicId, companyId)
  if ('error' in c) return c

  const r = await listarBeneficiarios(c.cred, c.token)
  if (r.tokenNovo) await guardarToken(ctx.admin, companyId, r.tokenNovo.token, r.tokenNovo.expiraEm)
  if (!r.ok) return { error: r.erro.mensagem }

  const { data: profs } = await ctx.admin
    .from('profiles').select('id, full_name, acquirer_recipient_code')
    .eq('clinic_id', ctx.clinicId).not('acquirer_recipient_code', 'is', null)

  return r.dados.map((b): BeneficiarioDisponivel => {
    const p = (profs ?? []).find(x => String(x.acquirer_recipient_code) === b.code)
    return {
      code: b.code, name: b.name, document: b.document,
      professional_id: (p?.id as string | undefined) ?? null,
      professional_name: (p?.full_name as string | undefined) ?? null,
    }
  })
}

/** Amarra o código de beneficiário a um profissional. */
export async function vincularBeneficiario(input: {
  professionalId: string
  code: string | null
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!EH_GESTAO(ctx.role)) return { error: 'Acesso restrito à gestão da clínica.' }

  const { error } = await ctx.admin
    .from('profiles')
    .update({ acquirer_recipient_code: input.code?.trim() || null })
    .eq('id', input.professionalId)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Erro ao vincular: ' + mensagemErro(error, 'lib/actions/card-acquirer.ts') }

  revalidatePath('/dashboard/management')
  return { ok: true }
}

// ─── Cobrança ───────────────────────────────────────────────────────────────

/** O que o caixa pode oferecer para a empresa daquela venda. */
export async function opcoesDeCobranca(companyId: string, valor: number): Promise<OpcoesDeCobranca | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const { data: empresa } = await ctx.admin
    .from('companies').select('id, name').eq('id', companyId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!empresa) return { error: 'Empresa não encontrada nesta clínica.' }

  const base = {
    company_id: companyId, company_name: empresa.name as string,
    terminais: [] as TerminalDisponivel[],
    bandeiras: [] as OpcoesDeCobranca['bandeiras'],
    link_disponivel: false,
  }

  const c = await credenciaisDaEmpresa(ctx.admin, ctx.clinicId, companyId)
  if ('error' in c) return { ...base, disponivel: false, motivo: c.error }

  const [term, metodos] = await Promise.all([
    listarTerminaisDaEmpresa(companyId),
    consultarMetodosDePagamento(c.cred, valor),
  ])

  const terminais = Array.isArray(term) ? term : []

  // As bandeiras REALMENTE habilitadas vêm de payment-methods; a tabela cheia
  // tem mais do que o estabelecimento aceita, e oferecer uma não habilitada dá
  // erro na frente do tutor.
  const habilitadas = metodos.ok
    ? [...new Set(metodos.dados.flatMap(m => m.bandeiras))]
    : Object.keys(BANDEIRAS)

  return {
    ...base,
    disponivel: true,
    motivo: terminais.some(t => t.pode_cobrar) ? null
      : 'Nenhuma maquininha pronta — a cobrança por link continua disponível.',
    terminais,
    bandeiras: habilitadas
      .filter(b => BANDEIRAS[b])
      .map(b => ({ codigo: b, rotulo: BANDEIRAS[b].rotulo, tipo: BANDEIRAS[b].tipo })),
    // O Link aceita só crédito — débito existe apenas na maquininha.
    link_disponivel: metodos.ok ? metodos.dados.length > 0 : true,
  }
}

/** Monta o split a partir das comissões configuradas, em valor absoluto. */
async function montarSplit(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  consultationId: string | null,
  total: number,
): Promise<{ splits: Array<{ code: string; valor: number; nome: string }>; avisos: string[] }> {
  const avisos: string[] = []
  if (!consultationId) return { splits: [], avisos }

  // Profissional responsável pela OS e a comissão dele.
  const { data: consulta } = await admin
    .from('consultations').select('vet_id').eq('id', consultationId).eq('clinic_id', clinicId).maybeSingle()
  const vetId = (consulta as { vet_id?: string } | null)?.vet_id
  if (!vetId) return { splits: [], avisos }

  const { data: prof } = await admin
    .from('profiles').select('id, full_name, acquirer_recipient_code')
    .eq('id', vetId).eq('clinic_id', clinicId).maybeSingle()
  const code = (prof as { acquirer_recipient_code?: string } | null)?.acquirer_recipient_code
  if (!code) return { splits: [], avisos }

  // `user_commissions` guarda SEMPRE percentual (`percentage`), e a regra
  // genérica do profissional é a de `item_type='all'` com `item_id` nulo. A
  // comissão por item específico não cabe aqui: o split da operadora é um valor
  // único sobre a venda inteira, não por linha.
  const { data: comissoes } = await admin
    .from('user_commissions').select('percentage')
    .eq('clinic_id', clinicId).eq('user_id', vetId)
    .eq('item_type', 'all').is('item_id', null)
    .limit(1)
  const pct = Number((comissoes?.[0] as { percentage?: number } | undefined)?.percentage ?? 0)
  if (!(pct > 0)) return { splits: [], avisos }

  // A API não trabalha com percentual: convertemos para valor absoluto, e a
  // sobra do arredondamento fica com a clínica.
  const valor = comissaoEmValor(total, pct)
  if (!(valor > 0)) return { splits: [], avisos }

  const nome = (prof as { full_name?: string } | null)?.full_name ?? 'profissional'
  const validacao = validarSplit(total, [{ valor, nome }])
  if ('erro' in validacao) {
    avisos.push(validacao.erro)
    return { splits: [], avisos }
  }
  return { splits: [{ code: String(code), valor, nome }], avisos }
}

/**
 * Cria uma cobrança por LINK.
 *
 * O link aceita só crédito e recorrência — débito exige a maquininha. O caixa
 * fecha otimista: o link nasce e o título fica aguardando; o retorno chega pelo
 * callback e é confirmado por consulta antes de valer.
 */
export async function cobrarPorLink(input: {
  companyId:       string
  valor:           number
  maxParcelas?:    number
  consultationId?: string | null
  tutorId?:        string | null
  descricao?:      string | null
  /** Repassar comissão do profissional automaticamente. */
  comSplit?:       boolean
}): Promise<CobrancaCriada | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!(input.valor > 0)) return { error: 'O valor da cobrança deve ser maior que zero.' }

  const c = await credenciaisDaEmpresa(ctx.admin, ctx.clinicId, input.companyId)
  if ('error' in c) return c

  const avisos: string[] = []

  // Dados do tutor: quanto mais mandarmos, menos ele digita na página de
  // pagamento (documento, telefone e e-mail chegam preenchidos).
  let nomeTutor = 'Cliente', doc: string | null = null, email: string | null = null, fone: string | null = null
  if (input.tutorId) {
    const { data: t } = await ctx.admin
      .from('tutors').select('name, cpf, email, phone')
      .eq('id', input.tutorId).eq('clinic_id', ctx.clinicId).maybeSingle()
    if (t) {
      nomeTutor = (t.name as string) ?? nomeTutor
      doc = (t.cpf as string | null) ?? null
      email = (t.email as string | null) ?? null
      const bruto = (t.phone as string | null) ?? null
      // A operadora exige E.164 e recusa qualquer outro formato.
      if (bruto) {
        const so = bruto.replace(/\D/g, '')
        fone = so.length >= 10 ? `+55${so.slice(-11)}` : null
      }
    }
  }

  const { data: cfgSeg } = await ctx.admin
    .from('company_card_acquirer').select('webhook_secret').eq('company_id', input.companyId).maybeSingle()
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'
  const callbackUrl = cfgSeg?.webhook_secret
    ? `${baseUrl}/api/webhooks/evoluservices/${cfgSeg.webhook_secret}`
    : null

  let splits: Array<{ code: string; valor: number }> = []
  if (input.comSplit) {
    const m = await montarSplit(ctx.admin, ctx.clinicId, input.consultationId ?? null, input.valor)
    splits = m.splits.map(s => ({ code: s.code, valor: s.valor }))
    avisos.push(...m.avisos)
  }

  const referencia = `SYSVET-${Date.now().toString(36).toUpperCase()}`
  const r = await criarLink(c.cred, {
    referencia,
    valor:            input.valor,
    maxParcelas:      input.maxParcelas ?? 1,
    clienteNome:      nomeTutor,
    clienteDocumento: doc,
    clienteEmail:     email,
    clienteTelefone:  fone,
    descricao:        input.descricao ?? null,
    callbackUrl,
    splits:           splits.length ? splits : undefined,
  })

  if (!r.ok) return { error: r.erro.mensagem }

  const { data: nova, error } = await ctx.admin.from('card_transactions').insert({
    clinic_id:  ctx.clinicId,
    company_id: input.companyId,
    kind:       'link',
    reference:  referencia,
    order_uuid: r.dados.uuid,
    pay_url:    r.dados.payUrl,
    status:     r.dados.status,
    amount:     input.valor,
    installments: input.maxParcelas ?? 1,
    consultation_id: input.consultationId ?? null,
    tutor_id:   input.tutorId ?? null,
    created_by: ctx.userId,
  }).select('id').single()

  if (error) {
    // O link JÁ existe na operadora: não dá para fingir que a cobrança falhou.
    return {
      card_transaction_id: '',
      pay_url: r.dados.payUrl,
      mensagem: 'O link foi criado na operadora, mas não foi possível registrá-lo no sistema. Guarde o link.',
      avisos: [...avisos, mensagemErro(error, 'lib/actions/card-acquirer.ts')],
    }
  }

  revalidatePath('/dashboard/cashier')
  return {
    card_transaction_id: (nova as unknown as { id: string }).id,
    pay_url: r.dados.payUrl,
    mensagem: splits.length
      ? `Link gerado com repasse automático de ${splits.length} profissional.`
      : 'Link gerado. Envie ao tutor para pagamento.',
    avisos,
  }
}

/** Atualiza uma cobrança consultando a operadora — o botão "já pagou?". */
export async function atualizarCobranca(cardTransactionId: string): Promise<{
  ok: true; situacao: string; rotulo: string; orientacao: string
} | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const { data: tx } = await ctx.admin
    .from('card_transactions')
    .select('id, company_id, order_uuid, status')
    .eq('id', cardTransactionId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!tx) return { error: 'Cobrança não encontrada.' }
  if (!tx.order_uuid) return { error: 'Esta cobrança não é por link — o retorno vem pela maquininha.' }

  const c = await credenciaisDaEmpresa(ctx.admin, ctx.clinicId, tx.company_id as string)
  if ('error' in c) return c

  const r = await consultarOrder(c.cred, tx.order_uuid as string)
  if (!r.ok) return { error: r.erro.mensagem }

  const transacao = r.dados.transacoes[0]
  const situacao = lerSituacao(r.dados.status, transacao?.status)

  await ctx.admin.from('card_transactions').update({
    status: r.dados.status,
    nsu: transacao?.nsu ?? null,
    authorization_number: transacao?.autorizacao ?? null,
    payment_brand: transacao?.bandeira ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', cardTransactionId).eq('clinic_id', ctx.clinicId)

  // O líquido por parcela (já com a taxa descontada) é o que entra na conta.
  if (transacao?.pagamentos?.length) {
    await ctx.admin.from('card_transaction_payments').upsert(
      transacao.pagamentos.map(p => ({
        clinic_id: ctx.clinicId, card_transaction_id: cardTransactionId,
        // Documento vazio, nunca nulo: o indice unico e por coluna (0510) e
        // NULL nao conflita com NULL — cada consulta criaria linha nova.
        kind: 'merchant' as const, recipient_document: '',
        number: p.numero, amount: p.valor,
        status: p.status, pay_date: p.dataPrevista
          ? (p.dataPrevista.includes('/')
             ? p.dataPrevista.split('/').reverse().join('-')
             : p.dataPrevista.slice(0, 10))
          : null,
      })),
      { onConflict: 'card_transaction_id,kind,number,recipient_document' },
    )
  }

  revalidatePath('/dashboard/cashier')
  return { ok: true, situacao: situacao.situacao, rotulo: situacao.rotulo, orientacao: situacao.orientacao }
}

/**
 * Telefone no formato E.164 que eles validam (`^\+[1-9]\d{1,14}$`).
 *
 * Devolve null em vez de chutar: telefone invalido derruba a cobranca inteira
 * com `CLIENT_PHONE_INVALID`, e perder a venda por causa de um cadastro velho
 * seria desproporcional.
 */
function formatarTelefoneE164(bruto: string | null | undefined): string | null {
  const digitos = (bruto ?? '').replace(/\D/g, '')
  if (!digitos) return null
  // Celular brasileiro: 11 digitos com DDD. Fixo: 10.
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`
  // Ja veio com o 55 na frente.
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return `+${digitos}`
  return null
}

/**
 * Cobra na MAQUININHA.
 *
 * O `terminalId` vai sempre que conhecido: sem ele, a cobranca vira "notificacao
 * nos aparelhos habilitados", o que nao serve para pinpad de cabo — ele nao tem
 * menu para alguem abrir.
 *
 * O caixa fecha OTIMISTA. O retorno da operadora leva de 10 a 15 minutos no POS,
 * e a recepcao nao pode segurar o tutor esperando: a cobranca nasce aguardando e
 * o callback concilia depois.
 *
 * ⚠️ ARMADILHA MEDIDA EM 22/10/2026, no pinpad de cabo da Animais: a ordem
 * chega ao programa Windows por fila SQS em ~1 segundo, mas ele so aciona a
 * leitora se a tela dele estiver LIVRE. Qualquer caixa de dialogo aberta segura
 * a venda no `RemoteTransactionBuffer` e a maquininha nao acende — sem erro
 * nenhum do lado da API, que ja respondeu sucesso. No sandbox isso acontece
 * sempre, porque `/v2/pix-service/merchantConfig` devolve corpo invalido e o
 * programa abre "Nao foi possivel recuperar seu plano pix". Dispensado o
 * dialogo, o fluxo anda em 3 segundos. Por isso o aviso de tela livre vai no
 * retorno: sem ele a recepcao fica olhando para uma maquininha apagada.
 */
export async function cobrarNaMaquininha(input: {
  companyId:       string
  valor:           number
  /** Define credito x debito. Debito nao aceita parcelamento. */
  bandeira:        string
  parcelas?:       number
  terminalId?:     string | null
  consultationId?: string | null
  tutorId?:        string | null
  comSplit?:       boolean
}): Promise<CobrancaCriada | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!(input.valor > 0)) return { error: 'O valor da cobranca deve ser maior que zero.' }

  const info = BANDEIRAS[input.bandeira]
  if (!info) return { error: 'Bandeira nao reconhecida.' }
  const parcelas = input.parcelas ?? 1
  // Barrar aqui da mensagem em portugues; deixar passar devolveria
  // INSTALLMENTS_INVALID_FOR_DEBIT em HTTP 500 na frente do tutor.
  if (info.tipo === 'debito' && parcelas > 1) {
    return { error: 'Debito nao pode ser parcelado. Use credito ou cobre em uma parcela.' }
  }

  const c = await credenciaisDaEmpresa(ctx.admin, ctx.clinicId, input.companyId)
  if ('error' in c) return c

  const avisos: string[] = []

  // Terminal: o escolhido, ou o padrao da empresa. A doc manda conferir o
  // status ANTES — num pinpad de cabo, OFFLINE normalmente significa que o
  // computador da recepcao esta sem o programa aberto.
  const { data: cfg } = await ctx.admin
    .from('company_card_acquirer')
    .select('default_terminal_id, webhook_secret')
    .eq('company_id', input.companyId).maybeSingle()

  let terminalId = input.terminalId ?? (cfg?.default_terminal_id as string | null) ?? null
  const term = await listarTerminais(c.cred, c.token)
  if (term.tokenNovo) await guardarToken(ctx.admin, input.companyId, term.tokenNovo.token, term.tokenNovo.expiraEm)
  if (term.ok) {
    const alvo = terminalId
      ? term.dados.find(t => t.terminalId === terminalId)
      : term.dados.find(t => /^ONLINE/.test(t.terminalStatus))
    if (!alvo) {
      return { error: terminalId
        ? 'A maquininha escolhida nao aparece mais na operadora. Escolha outra.'
        : 'Nenhuma maquininha disponivel. Verifique se ela esta ligada e, se for de cabo, se o computador dela esta com o programa aberto.' }
    }
    const st = STATUS_TERMINAL[alvo.terminalStatus]
    if (st && !st.pode_cobrar) return { error: st.explicacao }
    terminalId = alvo.terminalId
  }

  let splits: Array<{ code: string; valor: number }> = []
  if (input.comSplit) {
    const m = await montarSplit(ctx.admin, ctx.clinicId, input.consultationId ?? null, input.valor)
    splits = m.splits.map(x => ({ code: x.code, valor: x.valor }))
    avisos.push(...m.avisos)
  }

  let nomeTutor = 'Cliente'
  let doc: string | null = null
  let email: string | null = null
  let telefone: string | null = null
  if (input.tutorId) {
    const { data: t } = await ctx.admin
      .from('tutors').select('name, cpf, email, phone')
      .eq('id', input.tutorId).eq('clinic_id', ctx.clinicId).maybeSingle()
    if (t) {
      nomeTutor = (t.name as string) ?? nomeTutor
      doc = (t.cpf as string | null) ?? null
      // Medido em 22/10/2026: mandar o e-mail aqui NAO elimina a pergunta "Como
      // gostaria do comprovante?" no programa da operadora, mas deixa o campo
      // JA PREENCHIDO na tela de envio — a recepcao clica, nao digita. E o
      // comprovante vai para o tutor, que e quem deveria te-lo.
      email = (t.email as string | null)?.trim() || null
      telefone = formatarTelefoneE164(t.phone as string | null)
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'
  const referencia = `SYSVET-${Date.now().toString(36).toUpperCase()}`

  const r = await criarTransacaoRemota(c.cred, {
    valor:            input.valor,
    terminalId,
    parcelas,
    bandeira:         input.bandeira,
    callbackUrl:      cfg?.webhook_secret ? `${baseUrl}/api/webhooks/evoluservices/${cfg.webhook_secret}` : null,
    clienteNome:      nomeTutor,
    clienteDocumento: doc,
    clienteEmail:     email,
    clienteTelefone:  telefone,
    permiteAlterar:   false,
    splits:           splits.length ? splits : undefined,
  }, c.token)
  if (r.tokenNovo) await guardarToken(ctx.admin, input.companyId, r.tokenNovo.token, r.tokenNovo.expiraEm)
  if (!r.ok) return { error: r.erro.mensagem }

  const { data: nova, error } = await ctx.admin.from('card_transactions').insert({
    clinic_id:  ctx.clinicId,
    company_id: input.companyId,
    kind:       'remote',
    reference:  referencia,
    transaction_id: r.dados.transactionId,
    amount:     input.valor,
    installments: parcelas,
    payment_brand: input.bandeira,
    terminal_id: terminalId,
    consultation_id: input.consultationId ?? null,
    tutor_id:   input.tutorId ?? null,
    created_by: ctx.userId,
  }).select('id').single()

  if (error) {
    // A maquina JA acendeu: a cobranca existe do lado deles.
    return {
      card_transaction_id: '',
      transaction_id: r.dados.transactionId,
      mensagem: 'A maquininha foi acionada, mas a cobranca nao foi registrada no sistema. Anote o comprovante.',
      avisos: [...avisos, mensagemErro(error, 'lib/actions/card-acquirer.ts')],
    }
  }

  revalidatePath('/dashboard/cashier')
  return {
    card_transaction_id: (nova as unknown as { id: string }).id,
    transaction_id: r.dados.transactionId,
    mensagem: `Maquininha acionada — peca o cartao ao tutor.${splits.length ? ' O repasse do profissional sai automatico.' : ''}`,
    avisos: [
      ...avisos,
      'Se a maquininha nao acender, veja se o programa da operadora esta com alguma janela de aviso aberta: ela segura a cobranca.',
      'O comprovante da operadora pode levar alguns minutos para chegar ao sistema; o atendimento nao precisa esperar.',
    ],
  }
}

/** Cancela uma cobranca que a maquininha ainda nao processou. */
export async function cancelarCobrancaMaquininha(cardTransactionId: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const { data: tx } = await ctx.admin
    .from('card_transactions')
    .select('id, company_id, transaction_id, kind')
    .eq('id', cardTransactionId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!tx) return { error: 'Cobranca nao encontrada.' }
  if (tx.kind !== 'remote' || !tx.transaction_id) {
    return { error: 'Esta cobranca nao e da maquininha.' }
  }

  const c = await credenciaisDaEmpresa(ctx.admin, ctx.clinicId, tx.company_id as string)
  if ('error' in c) return c

  const r = await cancelarTransacaoRemota(c.cred, tx.transaction_id as string, c.token)
  if (r.tokenNovo) await guardarToken(ctx.admin, tx.company_id as string, r.tokenNovo.token, r.tokenNovo.expiraEm)
  if (!r.ok) return { error: r.erro.mensagem }

  await ctx.admin.from('card_transactions')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', cardTransactionId).eq('clinic_id', ctx.clinicId)

  revalidatePath('/dashboard/cashier')
  return { ok: true }
}

/**
 * Le o andamento da cobranca na maquininha.
 *
 * Nao chama a operadora: a Transacao Remota nao tem endpoint de consulta — o
 * desfecho so chega pelo callback. Enquanto ele nao vem, a recepcao digita o
 * NSU do comprovante como sempre fez; quando vem, a tela preenche sozinha.
 */
export async function acompanharCobrancaMaquininha(
  cardTransactionId: string,
): Promise<AndamentoCobranca | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const { data: tx } = await ctx.admin
    .from('card_transactions')
    .select('status, nsu, authorization_number, payment_brand, installments, callback_count')
    .eq('id', cardTransactionId).eq('clinic_id', ctx.clinicId).maybeSingle()
  if (!tx) return { error: 'Cobranca nao encontrada.' }

  const status = (tx.status as string | null) ?? null
  const leitura = lerSituacao(status ?? 'PENDING')

  return {
    status,
    rotulo:      leitura.rotulo,
    // So e desfecho quando ha NSU: a operadora manda callback intermediario.
    concluida:   Boolean(tx.nsu) || leitura.situacao === 'recusada',
    nsu:         (tx.nsu as string | null) ?? null,
    autorizacao: (tx.authorization_number as string | null) ?? null,
    bandeira:    (tx.payment_brand as string | null) ?? null,
    parcelas:    (tx.installments as number | null) ?? null,
    callbacks:   (tx.callback_count as number | null) ?? 0,
  }
}

// --- Extrato ---─────────────────────────────────────────────────────────────

/**
 * Extrato de cartão com o split separado.
 *
 * É a dor da Aline: hoje os relatórios mostram R$ 1.600 como se fossem todos da
 * Develey, quando a parte do profissional vai direta a ele e nunca passa pela
 * conta da clínica.
 */
export async function getExtratoCartao(input: {
  companyId?: string | null
  desde?:     string | null
  ate?:       string | null
}): Promise<LinhaExtratoCartao[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) {
    return { error: 'Acesso restrito à gestão e ao financeiro.' }
  }

  let qb = ctx.admin
    .from('card_transactions')
    .select(`
      id, kind, reference, status, amount, installments, payment_brand, created_at,
      consulta:consultations ( os_number ),
      tutor:tutors ( name )
    `)
    .eq('clinic_id', ctx.clinicId)
    .order('created_at', { ascending: false })
    .limit(300)

  if (input.companyId) qb = qb.eq('company_id', input.companyId)
  if (input.desde)     qb = qb.gte('created_at', input.desde)
  if (input.ate)       qb = qb.lte('created_at', input.ate + 'T23:59:59')

  const { data, error } = await qb
  if (error) return { error: 'Erro ao ler o extrato: ' + mensagemErro(error, 'lib/actions/card-acquirer.ts') }
  const linhas = data ?? []
  if (linhas.length === 0) return []

  const ids = linhas.map(l => l.id as string)
  const { data: parcelas } = await ctx.admin
    .from('card_transaction_payments')
    .select('card_transaction_id, kind, number, amount, status, pay_date, recipient_name')
    .eq('clinic_id', ctx.clinicId)
    .in('card_transaction_id', ids)
    .order('number', { ascending: true })

  const porTx = new Map<string, typeof parcelas>()
  for (const p of parcelas ?? []) {
    const k = p.card_transaction_id as string
    if (!porTx.has(k)) porTx.set(k, [])
    porTx.get(k)!.push(p)
  }

  const um = (v: unknown): string | null => {
    const o = Array.isArray(v) ? v[0] : v
    return (o as { os_number?: string; name?: string } | null)?.os_number
      ?? (o as { name?: string } | null)?.name ?? null
  }

  return linhas.map((l): LinhaExtratoCartao => {
    const ps = porTx.get(l.id as string) ?? []
    const situacao = lerSituacao(l.status as string)
    return {
      id: l.id as string,
      kind: l.kind as 'remote' | 'link',
      reference: l.reference as string,
      status: (l.status as string) ?? '',
      rotulo_status: situacao.rotulo,
      amount: Number(l.amount ?? 0),
      installments: l.installments === null ? null : Number(l.installments),
      payment_brand: (l.payment_brand as string | null) ?? null,
      created_at: l.created_at as string,
      os_number: um((l as Record<string, unknown>).consulta),
      tutor_nome: um((l as Record<string, unknown>).tutor),
      total_clinica: ps.filter(p => p.kind === 'merchant').reduce((s, p) => s + Number(p.amount ?? 0), 0),
      total_split:   ps.filter(p => p.kind === 'split').reduce((s, p) => s + Number(p.amount ?? 0), 0),
      parcelas: ps.map(p => ({
        kind: p.kind as 'merchant' | 'split',
        numero: Number(p.number ?? 0),
        valor: Number(p.amount ?? 0),
        status: (p.status as string) ?? '',
        data: (p.pay_date as string | null) ?? null,
        beneficiario: (p.recipient_name as string | null) ?? null,
      })),
    }
  })
}
