'use server'

// 1.10 · PAGFOR — Pagamento a Fornecedores (GRUPO A, contas a pagar).
// Fluxo: importar DDA (boletos emitidos contra o CNPJ da clínica) → cruzar com os
// títulos a pagar (legenda verde = já no sistema / vermelho = não está) → lançar os
// que faltam "mantendo os dados" + agendar pagamento (vencimento ou data X) →
// gerar remessa PAGFOR. A remessa real (CNAB 240 / API) depende do convênio do
// banco do cliente; por ora gera um rascunho estruturado para conferência.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantCtx } from '@/lib/data/context'
import { revalidatePath } from 'next/cache'
import {
  resolverFornecedor, apenasDigitos, documentoValido, formatarCnpj,
  precisaEnriquecer, enriquecerFornecedor,
} from '@/lib/financial/fornecedor-dda'
import { lookupCnpj } from '@/lib/cnpj'
import { digitalDoBoleto } from '@/lib/financial/dda-digital'
import { mensagemErro } from '@/lib/errors'
import type {
  DdaBoleto, DdaMatchRow, DdaMatchResult, PreviaFornecedorDda, DdaBoletoPersistido,
} from '@/types/pagfor'
import {
  consultarDDA, consultarBoletoParaPagar, pagarBoleto, consultarComprovante, cancelarAgendamento,
  type PagamentosRuntime,
} from '@/lib/integrations/sicoob-pagamentos'

async function ctx() {
  const t = await getTenantCtx()
  if (!t?.clinicId) return null
  return { clinicId: t.clinicId, role: t.role }
}
async function userId() {
  const s = await createClient()
  const { data: { user } } = await s.auth.getUser()
  return user?.id ?? null
}

/** Quantos CNPJs consultar na API pública por lançamento — ver o comentário
 *  em insertPayablesFromDda. Medido: 429 a partir da 5ª/6ª chamada seguida. */
const ORCAMENTO_CNPJ = 4

const onlyDigits = (s: string | null) => (s ?? '').replace(/\D/g, '')
const eqAmt = (a: number | null, b: number) => a != null && Math.abs(a - b) <= 0.01

// Cruza os boletos do DDA com os títulos a pagar pendentes.
export async function matchDdaBoletos(boletos: DdaBoleto[]): Promise<DdaMatchResult | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: payablesRaw } = await admin
    .from('financial_entries')
    .select('id, amount, due_date, description, beneficiary, barcode, scheduled_payment_date')
    .eq('clinic_id', c.clinicId).eq('type', 'payable').eq('status', 'pending')
  const payables = (payablesRaw ?? []) as Array<Record<string, unknown>>

  const used = new Set<string>()
  const rows: DdaMatchRow[] = boletos.map(b => {
    const bDigits = onlyDigits(b.barcode)
    const bName = (b.beneficiary ?? '').toLowerCase().trim()
    const hit = payables.find(p => {
      if (used.has(p.id as string)) return false
      // 1) casa por código de barras (forte)
      if (bDigits && onlyDigits(p.barcode as string) === bDigits) return true
      // 2) casa por valor + vencimento (±2d) + beneficiário aproximado
      if (!eqAmt(b.amount, Number(p.amount))) return false
      if (b.due_date && p.due_date) {
        const dd = Math.abs(new Date(b.due_date).getTime() - new Date(p.due_date as string).getTime()) / 86400000
        if (dd > 2) return false
      }
      if (bName) {
        const pName = String(p.beneficiary ?? p.description ?? '').toLowerCase()
        if (!pName.includes(bName) && !bName.includes(pName.slice(0, 8))) return false
      }
      return true
    })
    if (hit) {
      used.add(hit.id as string)
      return { boleto: b, status: 'in_system', entry_id: hit.id as string, entry_scheduled: (hit.scheduled_payment_date as string) ?? null }
    }
    return { boleto: b, status: 'not_in_system', entry_id: null, entry_scheduled: null }
  })

  return {
    rows,
    summary: {
      in_system:     rows.filter(r => r.status === 'in_system').length,
      not_in_system: rows.filter(r => r.status === 'not_in_system').length,
      total:         rows.length,
    },
  }
}

// Lança no sistema (contas a pagar) os boletos que não estavam — mantendo os dados.
export async function insertPayablesFromDda(
  boletos: DdaBoleto[],
  opcoes: { cadastrarFornecedor?: boolean } = {},
): Promise<{ ok: true; inserted: number; fornecedores_criados: number; fornecedores_vinculados: number } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const uid = await userId()
  const cadastrar = opcoes.cadastrarFornecedor !== false

  // Um fornecedor por CNPJ, não por boleto: o mesmo beneficiário costuma
  // aparecer várias vezes no período (no teste da Animais, 13 boletos para 11
  // fornecedores). Sem este cache seriam 13 consultas públicas e 13 tentativas
  // de inserir a mesma empresa.
  const porDocumento = new Map<string, string | null>()
  let criados = 0, vinculados = 0, inserted = 0, consultasUsadas = 0

  for (const b of boletos) {
    const amount = b.amount ?? 0
    if (amount <= 0) continue

    let supplierId: string | null = null
    let nomeFornecedor: string | null = b.beneficiary ?? null
    const doc = apenasDigitos(b.beneficiary_doc)

    if (cadastrar && documentoValido(doc)) {
      if (porDocumento.has(doc)) {
        supplierId = porDocumento.get(doc) ?? null
      } else {
        // ORÇAMENTO DE CONSULTAS. Medido contra os CNPJs reais da clínica: as
        // duas fontes públicas devolvem 429 a partir da 5ª ou 6ª chamada
        // seguida, mesmo espaçando. Estourar o limite aqui atrasaria o
        // lançamento para nada — o nome bom entra depois, por
        // `enriquecerFornecedoresDda`. O que NUNCA falha, e é o que importa,
        // é a amarração pelo CNPJ.
        const podeConsultar = consultasUsadas < ORCAMENTO_CNPJ
        const r = await resolverFornecedor(admin, c.clinicId, b, {
          userId: uid, consultarCnpj: podeConsultar,
        })
        if (podeConsultar) consultasUsadas++
        supplierId = r.supplier_id
        if (r.nome) nomeFornecedor = r.nome
        if (r.origem === 'criado') criados++
        porDocumento.set(doc, supplierId)
      }
      if (supplierId) vinculados++
    }

    const { data: novo, error } = await admin.from('financial_entries').insert({
      clinic_id: c.clinicId, type: 'payable',
      // Com fornecedor resolvido a descrição usa o nome BOM (da consulta
      // pública), não o truncado em 40 caracteres que o banco devolve.
      description: nomeFornecedor || b.document || 'Boleto (DDA)',
      beneficiary: nomeFornecedor ?? b.beneficiary ?? null,
      supplier_id: supplierId,
      barcode: b.barcode ?? null,
      amount, due_date: b.due_date ?? new Date().toISOString().slice(0, 10),
      issue_date: new Date().toISOString().slice(0, 10),
      status: 'pending', source: 'manual', category: 'Fornecedores',
      created_by: uid,
    }).select('id').single()

    if (!error && novo) {
      inserted++
      // Carimba o boleto guardado como LANÇADO. É isto que faz a tela saber,
      // na próxima consulta do período, que este já foi resolvido — sem isso
      // o operador interrompido reencontraria tudo como se fosse novo.
      await admin.from('dda_boletos')
        .update({
          entry_id: (novo as { id: string }).id,
          launched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('clinic_id', c.clinicId)
        .eq('fingerprint', digitalDoBoleto(c.clinicId, b))
    }
  }
  revalidatePath('/dashboard/financial')
  return { ok: true, inserted, fornecedores_criados: criados, fornecedores_vinculados: vinculados }
}

/**
 * Mostra, ANTES de lançar, quais fornecedores serão criados e com que nome.
 *
 * Existe porque consulta pública erra: CNPJ baixado, razão social
 * desatualizada, empresa que mudou de nome. Criar cadastro em silêncio é como
 * o sistema se enche de lixo que ninguém assume — a operadora confere e decide.
 *
 * Somente leitura: não cria nada.
 */
export async function previewFornecedoresDda(
  boletos: DdaBoleto[],
): Promise<PreviaFornecedorDda[] | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()

  // Agrupa por documento primeiro: é o fornecedor que interessa, não o boleto.
  const porDoc = new Map<string, { nome: string | null; boletos: number; total: number }>()
  for (const b of boletos) {
    const doc = apenasDigitos(b.beneficiary_doc)
    if (!documentoValido(doc)) continue
    const atual = porDoc.get(doc) ?? { nome: b.beneficiary ?? null, boletos: 0, total: 0 }
    atual.boletos += 1
    atual.total += b.amount ?? 0
    porDoc.set(doc, atual)
  }
  if (!porDoc.size) return []

  const { data: existentes } = await admin
    .from('suppliers').select('id, name, document')
    .eq('clinic_id', c.clinicId).not('document', 'is', null)
  const cadastrados = new Set((existentes ?? []).map(s => apenasDigitos((s as { document: string }).document)))

  const saida: PreviaFornecedorDda[] = []
  for (const [doc, info] of porDoc) {
    const ja = cadastrados.has(doc)
    let nomeFinal = info.nome
    let enriquecido = false
    // Só consulta quem vai mesmo ser criado: a API pública tem limite de taxa,
    // e para quem já está cadastrado o nome certo é o que a clínica mantém.
    if (!ja && doc.length === 14) {
      const cn = await lookupCnpj(doc)
      if (cn.ok && cn.razao_social) { nomeFinal = cn.razao_social; enriquecido = true }
    }
    saida.push({
      documento: doc,
      documento_fmt: formatarCnpj(doc),
      nome_no_banco: info.nome,
      nome_final: nomeFinal,
      ja_cadastrado: ja,
      nome_enriquecido: enriquecido,
      boletos: info.boletos,
      valor_total: Math.round(info.total * 100) / 100,
    })
  }
  return saida.sort((a, b) => Number(a.ja_cadastrado) - Number(b.ja_cadastrado) || b.valor_total - a.valor_total)
}

/**
 * Completa os fornecedores que entraram só com o nome do banco.
 *
 * Existe por uma medição, não por preferência: contra os CNPJs reais da
 * clínica, as duas fontes públicas devolvem HTTP 429 a partir da 5ª ou 6ª
 * consulta seguida, mesmo com intervalo. Dos 11 fornecedores do período
 * testado, 5 resolveram e 6 bateram no limite. Por isso o lançamento usa um
 * orçamento pequeno e o resto é completado aqui, aos poucos.
 *
 * Processa um lote por chamada, com intervalo entre consultas. Pode ser
 * chamada de novo até acabar — é idempotente, porque só mexe em quem está
 * incompleto.
 */
export async function enriquecerFornecedoresDda(
  limite = 4,
): Promise<{ ok: true; processados: number; atualizados: number; restantes: number } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()

  const { data } = await admin
    .from('suppliers')
    .select('id, name, document, address, phone')
    .eq('clinic_id', c.clinicId)
    .not('document', 'is', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(200)

  const candidatos = ((data ?? []) as Array<{
    id: string; name: string; document: string | null; address: string | null; phone: string | null
  }>).filter(precisaEnriquecer)

  const lote = candidatos.slice(0, Math.max(1, Math.min(limite, 10)))
  let atualizados = 0

  for (let i = 0; i < lote.length; i++) {
    const r = await enriquecerFornecedor(admin, c.clinicId, lote[i])
    if (r.ok && r.alterado) atualizados++
    // Para na primeira recusa por limite: insistir só queima a cota e atrasa.
    if (!r.ok && r.motivo === 'limite') break
    if (i < lote.length - 1) await new Promise(res => setTimeout(res, 1500))
  }

  revalidatePath('/dashboard/financial')
  return {
    ok: true,
    processados: lote.length,
    atualizados,
    restantes: Math.max(0, candidatos.length - atualizados),
  }
}

// ─── Persistência do DDA ─────────────────────────────────────────────────────
// Mesma regra da conciliação bancária: ao escolher o período, lê o que já está
// guardado e complementa com o que o banco trouxer. Sem isso, quem é
// interrompido no meio da rotina perde o trabalho e precisa recomeçar.

/** Grava (ou atualiza) os boletos do período, sem duplicar. */
async function guardarBoletos(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  boletos: DdaBoleto[],
  bankAccountId?: string | null,
): Promise<number> {
  if (!boletos.length) return 0
  const linhas = boletos.map(b => {
    let cru: unknown = {}
    try { cru = JSON.parse(b.raw) } catch { cru = {} }
    const r = cru as Record<string, unknown>
    return {
      clinic_id:       clinicId,
      bank_account_id: bankAccountId ?? null,
      fingerprint:     digitalDoBoleto(clinicId, b),
      barcode:         b.barcode,
      document:        b.document,
      beneficiary:     b.beneficiary,
      beneficiary_doc: b.beneficiary_doc,
      amount:          b.amount,
      due_date:        b.due_date,
      issue_date:      (r.dataEmissao as string) ?? null,
      situacao:        (r.descricaoSituacaoBoleto as string) ?? null,
      raw:             r,
      imported_at:     new Date().toISOString(),
    }
  })
  // ignoreDuplicates: reimportar o mesmo período NÃO pode sobrescrever o
  // estado do trabalho (lançado, ignorado) que já está gravado na linha.
  const { error } = await admin.from('dda_boletos')
    .upsert(linhas, { onConflict: 'clinic_id,fingerprint', ignoreDuplicates: true })
  if (error) return 0
  return linhas.length
}

function paraDdaBoleto(r: Record<string, unknown>): DdaBoleto {
  return {
    barcode:         (r.barcode as string) ?? null,
    beneficiary:     (r.beneficiary as string) ?? null,
    beneficiary_doc: (r.beneficiary_doc as string) ?? null,
    amount:          r.amount != null ? Number(r.amount) : null,
    due_date:        (r.due_date as string) ?? null,
    document:        (r.document as string) ?? null,
    raw:             JSON.stringify(r.raw ?? {}),
  }
}

function montarPersistido(r: Record<string, unknown>): DdaBoletoPersistido {
  return {
    id:               r.id as string,
    fingerprint:      r.fingerprint as string,
    boleto:           paraDdaBoleto(r),
    situacao:         (r.situacao as string) ?? null,
    entry_id:         (r.entry_id as string) ?? null,
    launched_at:      (r.launched_at as string) ?? null,
    dismissed_at:     (r.dismissed_at as string) ?? null,
    dismissed_reason: (r.dismissed_reason as string) ?? null,
    imported_at:      (r.imported_at as string) ?? null,
  }
}

/**
 * Carrega os boletos do DDA de um período.
 *
 * Ordem, que é a regra pedida pelo Diretor:
 *  1. lê o que já está guardado na janela;
 *  2. se não há NADA guardado, consulta o banco e guarda;
 *  3. se há, devolve o guardado — e `consultarBanco: true` força buscar de
 *     novo e complementar, sem perder o que o operador já resolveu.
 *
 * Boleto já lançado ou marcado para ignorar volta junto, com o estado, para a
 * tela saber o que não deve pedir de novo.
 */
export async function carregarDdaDoPeriodo(params: {
  dataInicial: string
  dataFinal: string
  bankAccountId?: string
  consultarBanco?: boolean
}): Promise<{
  ok: true
  boletos: DdaBoletoPersistido[]
  do_banco: number
  guardados: number
  consultou_banco: boolean
} | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()

  const ler = async () => {
    const { data } = await admin
      .from('dda_boletos')
      .select('id, fingerprint, barcode, document, beneficiary, beneficiary_doc, amount, due_date, situacao, raw, entry_id, launched_at, dismissed_at, dismissed_reason, imported_at')
      .eq('clinic_id', c.clinicId)
      .gte('due_date', params.dataInicial)
      .lte('due_date', params.dataFinal)
      .order('due_date', { ascending: true })
    return (data ?? []) as Record<string, unknown>[]
  }

  let guardados = await ler()
  let doBanco = 0
  let consultou = false

  // Consulta o banco quando não há nada guardado, ou quando o operador pediu
  // explicitamente para atualizar.
  if (!guardados.length || params.consultarBanco) {
    const res = await fetchDdaFromBank({
      bankAccountId: params.bankAccountId,
      dataInicial: params.dataInicial,
      dataFinal: params.dataFinal,
    })
    if ('error' in res) {
      // Falhou a consulta mas já havia dado guardado: entrega o guardado em
      // vez de deixar a tela vazia — o trabalho anterior continua acessível.
      if (guardados.length) {
        return { ok: true, boletos: guardados.map(montarPersistido), do_banco: 0,
                 guardados: guardados.length, consultou_banco: true }
      }
      return { error: res.error }
    }
    consultou = true
    doBanco = res.boletos.length
    await guardarBoletos(admin, c.clinicId, res.boletos, params.bankAccountId ?? null)
    guardados = await ler()
  }

  return {
    ok: true,
    boletos: guardados.map(montarPersistido),
    do_banco: doBanco,
    guardados: guardados.length,
    consultou_banco: consultou,
  }
}

/** Marca para ignorar — persistente, não some ao recarregar a tela. */
export async function ignorarBoletoDda(
  id: string,
  motivo?: string,
): Promise<{ ok: true } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const { error } = await admin.from('dda_boletos')
    .update({ dismissed_at: new Date().toISOString(), dismissed_reason: motivo ?? null,
              updated_at: new Date().toISOString() })
    .eq('id', id).eq('clinic_id', c.clinicId)
  if (error) return { error: mensagemErro(error, 'lib/actions/pagfor.ts') }
  revalidatePath('/dashboard/financial')
  return { ok: true }
}

/** Desfaz o ignorar. */
export async function reativarBoletoDda(id: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const { error } = await admin.from('dda_boletos')
    .update({ dismissed_at: null, dismissed_reason: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('clinic_id', c.clinicId)
  if (error) return { error: mensagemErro(error, 'lib/actions/pagfor.ts') }
  revalidatePath('/dashboard/financial')
  return { ok: true }
}

// Agenda o pagamento (no vencimento de cada título, ou numa data X).
export async function schedulePayments(params: {
  entry_ids: string[]
  scheduled_date?: string | null   // null/omitido = usar o vencimento de cada título
}): Promise<{ ok: true; scheduled: number } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!params.entry_ids.length) return { error: 'Nenhum título selecionado.' }
  const admin = createAdminClient()
  let scheduled = 0
  for (const id of params.entry_ids) {
    let date = params.scheduled_date ?? null
    if (!date) {
      const { data } = await admin.from('financial_entries').select('due_date').eq('id', id).eq('clinic_id', c.clinicId).single()
      date = (data?.due_date as string) ?? null
    }
    if (!date) continue
    const { error } = await admin.from('financial_entries')
      .update({ scheduled_payment_date: date, updated_at: new Date().toISOString() })
      .eq('id', id).eq('clinic_id', c.clinicId).eq('type', 'payable')
    if (!error) scheduled++
  }
  revalidatePath('/dashboard/financial')
  return { ok: true, scheduled }
}

// Gera um rascunho de remessa (conferência). CNAB 240 real / API do banco dependem
// do convênio do cliente (agência, conta, nº convênio) → plugam depois.
export async function generatePagforRemittance(entry_ids: string[]): Promise<{ content: string; filename: string; count: number } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!entry_ids.length) return { error: 'Nenhum título selecionado.' }
  const admin = createAdminClient()
  const { data } = await admin.from('financial_entries')
    .select('beneficiary, description, barcode, amount, due_date, scheduled_payment_date')
    .eq('clinic_id', c.clinicId).in('id', entry_ids).eq('type', 'payable')
  const rows = (data ?? []) as Array<Record<string, unknown>>
  const head = 'beneficiario;codigo_barras;valor;vencimento;data_pagamento'
  const body = rows.map(r => [
    String(r.beneficiary ?? r.description ?? '').replace(/;/g, ','),
    onlyDigits(r.barcode as string),
    Number(r.amount).toFixed(2).replace('.', ','),
    (r.due_date as string) ?? '',
    (r.scheduled_payment_date as string) ?? (r.due_date as string) ?? '',
  ].join(';'))
  return {
    content: [head, ...body].join('\r\n'),
    filename: `pagfor_remessa_${new Date().toISOString().slice(0, 10)}.csv`,
    count: rows.length,
  }
}

// ─── Sicoob Pagamentos (API real): varredura DDA + agendar/pagar ─────────────
async function loadPagamentosRuntime(admin: ReturnType<typeof createAdminClient>, clinicId: string, bankAccountId?: string): Promise<PagamentosRuntime | { error: string }> {
  // O DDA NAO depende da carteira bancaria. Lia conta/agencia/ambiente de
  // dentro de `boleto_config`, que e a carteira — mas conta e agencia sao
  // dados da CONTA, e a credencial (client_id + certificado) e da clinica.
  // Juntar tudo no boleto_config fazia a varredura do DDA exigir carteira
  // configurada sem necessidade nenhuma.
  //
  // A carteira continua obrigatoria para EMITIR boleto (cobranca), onde o
  // Sicoob precisa saber sob qual carteira registrar o titulo.
  let q = admin.from('bank_accounts').select('id, agency, account, bank_code, is_default').eq('clinic_id', clinicId)
  q = bankAccountId ? q.eq('id', bankAccountId) : q.eq('bank_code', '756').order('is_default', { ascending: false })
  const { data: acc } = await q.limit(1).maybeSingle()
  if (!acc) return { error: 'Nenhuma conta Sicoob cadastrada (Cadastros → Bancos).' }
  const conta = acc as { agency?: string | null; account?: string | null; bank_code?: string | null }

  // Mesma resolucao usada pelo extrato: ambiente, client_id e certificado vem
  // da configuracao da CLINICA, nunca de variavel de ambiente.
  const { resolverConfigSicoob } = await import('@/lib/integrations/sicoob-config')
  const r = await resolverConfigSicoob(admin, clinicId, {
    agency: conta.agency ?? null, account: conta.account ?? null, bank_code: conta.bank_code ?? null,
  })
  if ('error' in r) return { error: r.error }

  // Numero e agencia como a API quer: so digitos, COM o digito verificador.
  const numeroConta = Number(String(conta.account ?? '').replace(/\D/g, ''))
    || (r.config.environment === 'sandbox' ? 12345 : 0)
  const agencia = Number(String(conta.agency ?? '').replace(/\D/g, ''))
    || (r.config.environment === 'sandbox' ? 4321 : 0)
  if (r.config.environment === 'production' && (!numeroConta || !agencia)) {
    return { error: 'Conta ou agência sem número no cadastro (Cadastros → Bancos).' }
  }

  return { ...r.config, numeroConta, agencia }
}

/** Varredura do DDA direto no banco (substitui a importação manual do CSV). */
export async function fetchDdaFromBank(params: { bankAccountId?: string; dataInicial: string; dataFinal: string; situacao?: number; tipoData?: number }): Promise<{ ok: true; boletos: DdaBoleto[] } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const rt = await loadPagamentosRuntime(admin, c.clinicId, params.bankAccountId)
  if ('error' in rt) return { error: rt.error }
  // situacao e tipoData são obrigatórios na API (default: 1 = a pagar / por vencimento).
  const res = await consultarDDA(rt, { dataInicial: params.dataInicial, dataFinal: params.dataFinal, situacao: params.situacao ?? 1, tipoData: params.tipoData ?? 1 })
  if (!res.ok) return { error: res.error }
  return { ok: true, boletos: res.boletos as DdaBoleto[] }
}

/**
 * Agenda/paga no banco os títulos a pagar selecionados (consulta + pagamento),
 * grava idPagamento + data agendada + observação. Produção exige certificado A1.
 */
export async function payBoletosViaBank(params: { entry_ids: string[]; bankAccountId?: string; dataPagamento: string; observacao?: string }): Promise<{ ok: true; agendados: number; falhas: { id: string; erro: string }[] } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  if (!params.entry_ids.length) return { error: 'Nenhum título selecionado.' }
  const admin = createAdminClient()
  const rt = await loadPagamentosRuntime(admin, c.clinicId, params.bankAccountId)
  if ('error' in rt) return { error: rt.error }

  let agendados = 0
  const falhas: { id: string; erro: string }[] = []
  for (const id of params.entry_ids) {
    const { data: e } = await admin.from('financial_entries')
      .select('id, barcode, amount, beneficiary, description, notes, document_number').eq('id', id).eq('clinic_id', c.clinicId).eq('type', 'payable').maybeSingle()
    const barcode = (e as any)?.barcode ? String((e as any).barcode).replace(/\D/g, '') : ''
    if (!e || !barcode) { falhas.push({ id, erro: 'Título sem código de barras.' }); continue }
    // 1) consulta o boleto (obtém identificadorConsulta)
    const cons = await consultarBoletoParaPagar(rt, barcode, params.dataPagamento)
    if (!cons.ok) { falhas.push({ id, erro: cons.error }); continue }
    const r = (cons.raw as any)?.resultado ?? cons.raw
    const identificador = r?.identificadorConsulta ?? r?.hash ?? ''
    // 2) paga/agenda
    const pay = await pagarBoleto(rt, barcode, {
      identificadorConsulta: identificador, valor: Number((e as any).amount), dataPagamento: params.dataPagamento,
      observacao: params.observacao ?? `PAGFOR — ${(e as any).description ?? (e as any).beneficiary ?? 'fornecedor'}`,
      pagadorNome: (e as any).beneficiary ?? undefined, conta: { agencia: rt.agencia, conta: rt.numeroConta },
    })
    if (!pay.ok) { falhas.push({ id, erro: pay.error }); continue }
    const nota = `Pagamento agendado no Sicoob para ${params.dataPagamento.split('-').reverse().join('/')} (idPagamento ${pay.idPagamento ?? '—'}).`
    await admin.from('financial_entries').update({
      scheduled_payment_date: params.dataPagamento,
      notes: [(e as any).notes, nota].filter(Boolean).join('\n'),
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('clinic_id', c.clinicId)
    agendados++
  }
  revalidatePath('/dashboard/financial')
  return { ok: true, agendados, falhas }
}

/** Comprovante de um pagamento agendado/efetuado. */
export async function getPagforComprovante(idPagamento: string, bankAccountId?: string): Promise<{ ok: true; raw: unknown } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const rt = await loadPagamentosRuntime(admin, c.clinicId, bankAccountId)
  if ('error' in rt) return { error: rt.error }
  const res = await consultarComprovante(rt, idPagamento)
  return res.ok ? { ok: true, raw: res.raw } : { error: res.error }
}

/** Cancela um pagamento agendado no banco. */
export async function cancelPagforAgendamento(idPagamento: string, bankAccountId?: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const rt = await loadPagamentosRuntime(admin, c.clinicId, bankAccountId)
  if ('error' in rt) return { error: rt.error }
  const res = await cancelarAgendamento(rt, idPagamento)
  return res.ok ? { ok: true } : { error: res.error }
}
