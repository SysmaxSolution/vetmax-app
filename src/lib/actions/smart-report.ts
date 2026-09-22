'use server'

// Relatório Inteligente (1.c) — semantic layer seguro.
// askSmartReport: IA traduz linguagem natural → SPEC (JSON) validada contra o
// catálogo curado (NUNCA gera SQL, nunca calcula número). getSmartReport monta a
// consulta DETERMINÍSTICA (clinic_id server-side, só SELECT de receita reconhecida)
// e agrega com groupSum (testado). A IA fica FORA do caminho de confiança dos dados.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { groupSum, type GroupRow } from '@/lib/reports/revenue-breakdown'
import { isRecognizedRevenue, netAmount } from '@/lib/finance/reconciliation'
import {
  validateSpec, dimensionValue, catalogPromptSummary,
  METRICS, DIMENSIONS, type ReportSpec,
} from '@/lib/reports/semantic-catalog'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { clinic_id: profile.clinic_id as string, role: (profile.role as string) ?? 'staff' }
}

export interface SmartReportResult {
  spec:            ReportSpec
  metric_label:    string
  dimension_label: string
  money:           boolean
  rows:            GroupRow[]
  total:           number
}

// Executa a SPEC validada — consulta fixa (sem SQL dinâmico) + agregação.
export async function getSmartReport(rawSpec: any): Promise<SmartReportResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) return { error: 'Acesso negado' }

  const spec = validateSpec(rawSpec)
  if ('error' in spec) return { error: spec.error }

  const admin = createAdminClient()
  let q = admin
    .from('financial_entries')
    .select('category, payment_method, company_id, tutor_id, amount, discount, type, status, is_intercompany, is_clinic_discount, payment_date')
    .eq('clinic_id', ctx.clinic_id)
    .eq('type', 'receivable').eq('status', 'paid').eq('is_clinic_discount', false)
    .gte('payment_date', spec.from).lte('payment_date', spec.to + 'T23:59:59')
  if (spec.filters?.category)       q = q.eq('category', spec.filters.category)
  if (spec.filters?.payment_method) q = q.eq('payment_method', spec.filters.payment_method)
  const { data, error } = await q.limit(20000)
  if (error) return { error: error.message }

  const recognized = ((data ?? []) as any[]).filter(r => isRecognizedRevenue(r))

  // Mapas de nome só quando a dimensão precisa (empresa/cliente)
  const companyName = new Map<string, string>()
  const tutorName = new Map<string, string>()
  if (spec.dimension === 'company') {
    const { data: comps } = await admin.from('companies').select('id, name').eq('clinic_id', ctx.clinic_id)
    for (const c of (comps ?? []) as any[]) companyName.set(c.id, c.name)
  }
  if (spec.dimension === 'tutor') {
    const ids = [...new Set(recognized.map(r => r.tutor_id).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: tuts } = await admin.from('tutors').select('id, name').eq('clinic_id', ctx.clinic_id).in('id', ids)
      for (const t of (tuts ?? []) as any[]) tutorName.set(t.id, t.name)
    }
  }

  const isCount = METRICS[spec.metric].kind === 'count'
  const items = recognized.map(r => {
    const dv = dimensionValue(spec.dimension, r, { companyName, tutorName })
    return { key: dv.key, label: dv.label, amount: isCount ? 1 : netAmount(r) }
  })
  const { rows, total } = groupSum(items)

  return {
    spec,
    metric_label: METRICS[spec.metric].label,
    dimension_label: DIMENSIONS[spec.dimension].label,
    money: METRICS[spec.metric].money,
    rows, total,
  }
}

// Traduz o pedido em linguagem natural → SPEC via IA, valida e executa.
export async function askSmartReport(input: {
  question: string
  from: string
  to: string
}): Promise<SmartReportResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['admin', 'owner', 'manager', 'accountant'].includes(ctx.role)) return { error: 'Acesso negado' }
  if (!input.question?.trim()) return { error: 'Descreva o relatório desejado.' }
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'IA não configurada neste ambiente.' }

  const system = `Você converte um pedido de relatório (em português) num JSON estrito para um ERP veterinário. NUNCA calcule valores nem invente dados — apenas escolha do catálogo abaixo.
${catalogPromptSummary()}
Responda SOMENTE com um JSON no formato: {"metric":"<metric>","dimension":"<dimension>","from":"AAAA-MM-DD","to":"AAAA-MM-DD","filters":{"category":"<opcional>","payment_method":"<opcional>"}}.
Use metric e dimension EXATAMENTE com as chaves do catálogo. Se o pedido não indicar período, use from=${input.from} e to=${input.to}. Se indicar um período (ex.: "mês passado"), calcule as datas. Só inclua filters se o pedido pedir explicitamente. Sem texto fora do JSON.`

  let raw: any
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: input.question.trim() }],
    })
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return { error: 'Não consegui interpretar o pedido. Reformule.' }
    raw = JSON.parse(m[0])
  } catch (e) {
    return { error: 'Falha ao interpretar o pedido: ' + (e instanceof Error ? e.message : 'erro') }
  }

  // Defaults de período se a IA omitir
  if (!raw.from) raw.from = input.from
  if (!raw.to)   raw.to = input.to

  const spec = validateSpec(raw)
  if ('error' in spec) return { error: spec.error }
  return getSmartReport(spec)
}
