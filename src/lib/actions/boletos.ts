'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { incluirBoleto, consultarBoleto, baixarBoleto, type CobrancaRuntime } from '@/lib/integrations/sicoob-cobranca'
import type { BoletoInput } from '@/lib/integrations/sicoob-cobranca-map'
import { logBoletoEvent } from '@/lib/boleto/events'
import { clinicFlowFlag, routineOffError } from '@/lib/clinic/flow-gate'

type Ctx = { userId: string; clinicId: string; role: string }
async function ctx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  // Gate da rotina (Tarefa 0): flow_config.usa_boleto, padrão desligado.
  if (!(await clinicFlowFlag(createAdminClient(), profile.clinic_id as string, 'usa_boleto'))) {
    return routineOffError('A rotina de Boletos')
  }
  return { userId: user.id, clinicId: profile.clinic_id as string, role: (profile.role as string) ?? '' }
}

// Lê a config de cobrança da clínica (bloco `cobranca` em clinic_bank_integrations).
async function loadCobrancaConfig(clinicId: string): Promise<CobrancaRuntime | { error: string }> {
  const admin = createAdminClient()
  const { data } = await admin.from('clinic_bank_integrations').select('cobranca, banks').eq('clinic_id', clinicId).maybeSingle()
  const cob = (data as any)?.cobranca ?? {}
  const bank = ((data as any)?.banks ?? []).find((b: any) => b.provider === 'sicoob') ?? {}
  const environment: 'sandbox' | 'production' = (cob.environment ?? bank.environment ?? 'sandbox') === 'production' ? 'production' : 'sandbox'
  const numeroCliente = Number(cob.numeroCliente ?? 0)
  const numeroContaCorrente = Number(cob.numeroContaCorrente ?? bank.conta ?? 0)
  const codigoModalidade = Number(cob.codigoModalidade ?? 1)
  if (environment === 'sandbox') {
    // sandbox: usa números de teste caso não configurados
    return { environment, numeroCliente: numeroCliente || 25546454, numeroContaCorrente: numeroContaCorrente || 12345, codigoModalidade: codigoModalidade || 1 }
  }
  if (!numeroCliente || !numeroContaCorrente) return { error: 'Configure numeroCliente e conta corrente da cobrança Sicoob.' }
  return { environment, numeroCliente, numeroContaCorrente, codigoModalidade, clientId: cob.clientId ?? bank.client_id }
}

export interface EmitBoletoInput extends BoletoInput {
  consultationId?: string
  tutorId?: string
  companyId?: string
}

/** Emite um boleto e persiste o resultado. */
export async function emitBoleto(input: EmitBoletoInput): Promise<{ ok: true; id: string; linhaDigitavel: string | null; codigoBarras: string | null; nossoNumero: string | null } | { error: string }> {
  const c = await ctx()
  if ('error' in c) return { error: c.error }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão para emitir boletos.' }
  if (!(input.valor > 0)) return { error: 'Valor inválido.' }
  if (!input.pagador?.nome || !input.pagador?.cpfCnpj) return { error: 'Informe o pagador (nome e CPF/CNPJ).' }

  const cfg = await loadCobrancaConfig(c.clinicId)
  if ('error' in cfg) return { error: cfg.error }

  const today = new Date().toISOString().slice(0, 10)
  const res = await incluirBoleto(cfg, { ...input, dataEmissao: input.dataEmissao ?? today })

  const admin = createAdminClient()
  const base = {
    clinic_id: c.clinicId, company_id: input.companyId ?? null, provider: 'sicoob', environment: cfg.environment,
    consultation_id: input.consultationId ?? null, tutor_id: input.tutorId ?? null,
    seu_numero: input.seuNumero, valor: input.valor, vencimento: input.dataVencimento,
    pagador_nome: input.pagador.nome, pagador_cpf_cnpj: input.pagador.cpfCnpj.replace(/\D/g, ''),
    created_by: c.userId,
  }
  if (!res.ok) {
    const { data: row } = await admin.from('clinic_boletos').insert({ ...base, situacao: 'erro', error_message: res.error, raw_response: (res as any).raw ?? null }).select('id').single()
    return { error: res.error + (row ? '' : '') }
  }
  const { data: row, error } = await admin.from('clinic_boletos').insert({
    ...base, situacao: 'registrado',
    nosso_numero: res.result.nossoNumero, linha_digitavel: res.result.linhaDigitavel,
    codigo_barras: res.result.codigoBarras, pix_copia_cola: res.result.pixCopiaECola,
    raw_response: res.raw as any,
  }).select('id').single()
  if (error) return { error: error.message }
  return { ok: true, id: (row as any).id, linhaDigitavel: res.result.linhaDigitavel, codigoBarras: res.result.codigoBarras, nossoNumero: res.result.nossoNumero }
}

export interface BoletoRow {
  id: string; seuNumero: string; nossoNumero: string | null; valor: number; vencimento: string
  situacao: string; linhaDigitavel: string | null; codigoBarras: string | null; pagadorNome: string | null
  environment: string; createdAt: string; errorMessage: string | null
}

/** Lista os boletos emitidos pela clínica. */
export async function listBoletos(): Promise<BoletoRow[]> {
  const c = await ctx()
  if ('error' in c) return []
  const admin = createAdminClient()
  const { data } = await admin.from('clinic_boletos')
    .select('id, seu_numero, nosso_numero, valor, vencimento, situacao, linha_digitavel, codigo_barras, pagador_nome, environment, created_at, error_message')
    .eq('clinic_id', c.clinicId).order('created_at', { ascending: false }).limit(100)
  return (data ?? []).map((r: any) => ({
    id: r.id, seuNumero: r.seu_numero, nossoNumero: r.nosso_numero, valor: Number(r.valor), vencimento: r.vencimento,
    situacao: r.situacao, linhaDigitavel: r.linha_digitavel, codigoBarras: r.codigo_barras, pagadorNome: r.pagador_nome,
    environment: r.environment, createdAt: r.created_at, errorMessage: r.error_message,
  }))
}

/** Consulta a situação de um boleto no Sicoob e atualiza (pago/baixado). */
export async function refreshBoletoStatus(id: string): Promise<{ ok: true; situacao: string } | { error: string }> {
  const c = await ctx()
  if ('error' in c) return { error: c.error }
  const admin = createAdminClient()
  const { data: b } = await admin.from('clinic_boletos').select('nosso_numero').eq('id', id).eq('clinic_id', c.clinicId).maybeSingle()
  if (!b || !(b as any).nosso_numero) return { error: 'Boleto sem nosso número para consulta.' }
  const cfg = await loadCobrancaConfig(c.clinicId)
  if ('error' in cfg) return { error: cfg.error }
  const res = await consultarBoleto(cfg, (b as any).nosso_numero)
  if (!res.ok) return { error: res.error }
  const situacao = (res.raw as any)?.resultado?.situacaoBoleto ? String((res.raw as any).resultado.situacaoBoleto).toLowerCase() : 'registrado'
  const mapped = /pag|liquid/.test(situacao) ? 'pago' : /baix/.test(situacao) ? 'baixado' : 'registrado'
  if (mapped === 'pago') {
    // baixa automática do título vinculado com detalhamento do banco
    const { settleBoletoPaid } = await import('@/lib/boleto/settle')
    const raw = (res.raw as any)?.resultado ?? {}
    await settleBoletoPaid({ clinicId: c.clinicId, boletoId: id }, {
      paidAt: raw.dataPagamento ?? null, paidAmount: Number(raw.valorPago ?? 0) || null,
      bankDetail: `Consulta Sicoob em ${new Date().toLocaleString('pt-BR')}.`,
    })
  } else {
    await admin.from('clinic_boletos').update({ situacao: mapped, updated_at: new Date().toISOString() }).eq('id', id)
  }
  await logBoletoEvent(admin, { clinicId: c.clinicId, boletoId: id, eventType: 'consulta', actorId: c.userId, detail: `Consulta de situação no banco → ${mapped}`, situacao: mapped, payload: (res.raw as any)?.resultado ?? null })
  return { ok: true, situacao: mapped }
}

/** Baixa/cancela um boleto no Sicoob. */
export async function cancelBoleto(id: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx()
  if ('error' in c) return { error: c.error }
  if (!['admin', 'owner', 'manager'].includes(c.role)) return { error: 'Sem permissão.' }
  const admin = createAdminClient()
  const { data: b } = await admin.from('clinic_boletos').select('nosso_numero').eq('id', id).eq('clinic_id', c.clinicId).maybeSingle()
  if (!b || !(b as any).nosso_numero) return { error: 'Boleto sem nosso número.' }
  const cfg = await loadCobrancaConfig(c.clinicId)
  if ('error' in cfg) return { error: cfg.error }
  const res = await baixarBoleto(cfg, (b as any).nosso_numero)
  if (!res.ok) return { error: res.error }
  await admin.from('clinic_boletos').update({ situacao: 'baixado', updated_at: new Date().toISOString() }).eq('id', id)
  await logBoletoEvent(admin, { clinicId: c.clinicId, boletoId: id, eventType: 'baixado', actorId: c.userId, detail: 'Boleto baixado/cancelado no banco pelo usuário', situacao: 'baixado' })
  return { ok: true }
}
