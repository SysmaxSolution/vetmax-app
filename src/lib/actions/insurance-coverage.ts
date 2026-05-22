'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export type CoverageStatus =
  | 'covered'              // coberto e fora de carência
  | 'waiting'              // coberto mas em carência
  | 'not_covered'          // não previsto no plano contratado
  | 'no_insurance'         // pet sem convênio cadastrado
  | 'unknown_procedure'    // catálogo não conhece esse procedimento

export type CopayCharger = 'clinic' | 'provider' | 'mixed'

export interface ProcedureCoverageResult {
  status:             CoverageStatus
  provider_name?:     string
  plan_type?:         string
  procedure_pattern?: string
  category?:          string
  copay_amount?:      number
  copay_charger?:     CopayCharger
  /** Dias restantes para sair da carência (apenas quando status='waiting'). */
  waiting_remaining_days?: number
  /** Mensagem curta pronta para exibir na UI. */
  message:            string
  /** Bandeira visual sugerida. */
  badge:              'green' | 'yellow' | 'red' | 'gray'
}

export interface InsuranceCardData {
  has_insurance:       boolean
  provider_name?:      string
  plan_type?:          string
  coverage_status?:    string
  enrollment_date?:    string | null
  /** Dias desde a adesão. */
  days_enrolled?:      number
  /** Por categoria: dias restantes (0 = cumprida). */
  waiting_progress?: {
    consulta:             number
    vacina:               number
    procedimento_clinico: number
    exame_simples:        number
    exame_imagem:         number
    especialista:         number
    cirurgia:             number
    castracao:            number
    anestesia:            number
    internacao:           number
  }
  member_id?:          string | null
  valid_until?:        string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime()
  const b = new Date(toIso   + 'T00:00:00Z').getTime()
  return Math.floor((b - a) / 86400000)
}

type Ctx = {
  supabase: ReturnType<typeof createAdminClient>
  clinicId: string
}

async function getCtx(): Promise<Ctx | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { supabase: admin, clinicId: profile.clinic_id }
}

// ─── getInsuranceCard ────────────────────────────────────────────────────────
// Resumo do convênio ativo do pet + progresso de carência por categoria.

export async function getInsuranceCard(patientId: string): Promise<InsuranceCardData | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data: insurance } = await supabase
    .from('pet_insurance')
    .select('id, plan_type, coverage_status, enrollment_date, member_id, valid_until, created_at, provider_id, insurance_providers(name)')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .eq('coverage_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!insurance) return { has_insurance: false }

  // Fallback de enrollment_date: created_at do convênio
  const enrollmentDate: string = (insurance.enrollment_date as string | null)
    ?? (insurance.created_at as string).slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const daysEnrolled = daysBetween(enrollmentDate, today)

  // Busca carências por categoria nesse plano
  const { data: coverage } = await supabase
    .from('insurance_plan_coverage')
    .select('coverage_category, waiting_days')
    .eq('provider_id', insurance.provider_id)
    .eq('plan_type', insurance.plan_type)

  // Para cada categoria, calcula dias restantes (max(0, waiting - enrolled))
  const byCategoryMax = new Map<string, number>()
  for (const c of coverage ?? []) {
    const cur = byCategoryMax.get(c.coverage_category) ?? 0
    if (c.waiting_days > cur) byCategoryMax.set(c.coverage_category, c.waiting_days)
  }
  const r = (cat: string) => Math.max(0, (byCategoryMax.get(cat) ?? 0) - daysEnrolled)

  const providerName = ((insurance.insurance_providers as unknown) as { name: string } | { name: string }[] | null)
    ? (Array.isArray(insurance.insurance_providers)
        ? (insurance.insurance_providers as { name: string }[])[0]?.name ?? '—'
        : (insurance.insurance_providers as { name: string }).name)
    : '—'

  return {
    has_insurance:    true,
    provider_name:    providerName,
    plan_type:        insurance.plan_type ?? '—',
    coverage_status:  insurance.coverage_status,
    enrollment_date:  enrollmentDate,
    days_enrolled:    daysEnrolled,
    waiting_progress: {
      consulta:             r('consulta'),
      vacina:               r('vacina'),
      procedimento_clinico: r('procedimento_clinico'),
      exame_simples:        r('exame_simples'),
      exame_imagem:         r('exame_imagem'),
      especialista:         r('especialista'),
      cirurgia:             r('cirurgia'),
      castracao:            r('castracao'),
      anestesia:            r('anestesia'),
      internacao:           r('internacao'),
    },
    member_id:    insurance.member_id,
    valid_until:  insurance.valid_until,
  }
}

// ─── checkProcedureCoverage ──────────────────────────────────────────────────
// Para um pet + um procedimento (stock_item ou nome externo), responde:
//   - está coberto?
//   - tem carência cumprida?
//   - qual o copay e quem cobra?

export async function checkProcedureCoverage(args: {
  patientId:      string
  /** stock_item_id OU procedureName (se ainda não está mapeado a um stock_item). */
  stockItemId?:   string
  procedureName?: string
}): Promise<ProcedureCoverageResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  // 1) Convênio ativo do pet
  const { data: insurance } = await supabase
    .from('pet_insurance')
    .select('id, plan_type, enrollment_date, created_at, provider_id, insurance_providers(name)')
    .eq('clinic_id', clinicId)
    .eq('patient_id', args.patientId)
    .eq('coverage_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!insurance) {
    return {
      status:  'no_insurance',
      message: 'Pet sem convênio ativo — cobrar particular',
      badge:   'gray',
    }
  }

  const providerName = ((insurance.insurance_providers as unknown) as { name: string } | { name: string }[] | null)
    ? (Array.isArray(insurance.insurance_providers)
        ? (insurance.insurance_providers as { name: string }[])[0]?.name ?? '—'
        : (insurance.insurance_providers as { name: string }).name)
    : '—'

  // 2) Resolver nome do procedimento via stock_item ou nome direto
  let procName = (args.procedureName ?? '').trim()
  if (!procName && args.stockItemId) {
    // Procura mapping reverso (stock_item → procedure_pattern petlove)
    const { data: m } = await supabase
      .from('petlove_procedure_mappings')
      .select('external_procedure_name')
      .eq('clinic_id', clinicId)
      .eq('provider_id', insurance.provider_id)
      .eq('internal_stock_item_id', args.stockItemId)
      .maybeSingle()
    if (m?.external_procedure_name) procName = m.external_procedure_name
    else {
      // Fallback: nome do stock_item
      const { data: si } = await supabase
        .from('stock_items')
        .select('name')
        .eq('id', args.stockItemId)
        .maybeSingle()
      procName = si?.name ?? ''
    }
  }

  if (!procName) {
    return {
      status:  'unknown_procedure',
      message: 'Procedimento não identificado',
      badge:   'gray',
    }
  }

  // 3) Match no catálogo: 1) nome exato (case insensitive), 2) tokens
  const { data: catalog } = await supabase
    .from('insurance_plan_coverage')
    .select('procedure_pattern, coverage_category, is_covered, copay_amount, copay_charger, waiting_days')
    .eq('provider_id', insurance.provider_id)
    .eq('plan_type', insurance.plan_type)

  const target = normalizeName(procName)
  let match = (catalog ?? []).find(c => normalizeName(c.procedure_pattern) === target) ?? null
  if (!match) {
    // Match por prefixo significativo (tokens de 4+ chars)
    const tokens = target.split(' ').filter(t => t.length >= 4)
    if (tokens.length > 0) {
      match = (catalog ?? []).find(c => {
        const p = normalizeName(c.procedure_pattern)
        return tokens.every(t => p.includes(t))
      }) ?? null
    }
  }

  if (!match) {
    return {
      status:    'unknown_procedure',
      provider_name: providerName,
      plan_type: insurance.plan_type ?? undefined,
      procedure_pattern: procName,
      message:   `${providerName} ${insurance.plan_type}: catálogo não conhece "${procName}". Consulte o portal antes.`,
      badge:     'gray',
    }
  }

  if (!match.is_covered) {
    return {
      status:            'not_covered',
      provider_name:     providerName,
      plan_type:         insurance.plan_type ?? undefined,
      procedure_pattern: match.procedure_pattern,
      category:          match.coverage_category,
      message:           `Não coberto pelo plano ${insurance.plan_type}. Tutor paga particular.`,
      badge:             'red',
    }
  }

  // Carência
  const enrollment = (insurance.enrollment_date as string | null) ?? (insurance.created_at as string).slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const daysEnrolled = daysBetween(enrollment, today)
  const remaining = Math.max(0, match.waiting_days - daysEnrolled)

  if (remaining > 0) {
    return {
      status:                 'waiting',
      provider_name:          providerName,
      plan_type:              insurance.plan_type ?? undefined,
      procedure_pattern:      match.procedure_pattern,
      category:               match.coverage_category,
      copay_amount:           Number(match.copay_amount ?? 0),
      copay_charger:          match.copay_charger as CopayCharger,
      waiting_remaining_days: remaining,
      message:                `Em carência. Faltam ${remaining} dia${remaining !== 1 ? 's' : ''} para liberação.`,
      badge:                  'yellow',
    }
  }

  // Coberto + carência OK
  const copayLabel = match.copay_charger === 'clinic'
    ? `Tutor paga R$ ${Number(match.copay_amount ?? 0).toFixed(2)} no caixa`
    : match.copay_charger === 'provider'
      ? `Petlove cobrará R$ ${Number(match.copay_amount ?? 0).toFixed(2)} no cartão do tutor`
      : `Coparticipação dividida (≈ R$ ${Number(match.copay_amount ?? 0).toFixed(2)})`

  return {
    status:            'covered',
    provider_name:     providerName,
    plan_type:         insurance.plan_type ?? undefined,
    procedure_pattern: match.procedure_pattern,
    category:          match.coverage_category,
    copay_amount:      Number(match.copay_amount ?? 0),
    copay_charger:     match.copay_charger as CopayCharger,
    message:           copayLabel,
    badge:             'green',
  }
}

// ─── checkBatchCoverage ──────────────────────────────────────────────────────
// Versão batch para usar no fluxo de criar consulta com vários procedimentos.

export async function checkBatchCoverage(args: {
  patientId:  string
  procedures: Array<{ stockItemId?: string; procedureName?: string; key: string }>
}): Promise<Record<string, ProcedureCoverageResult | { error: string }>> {
  const out: Record<string, ProcedureCoverageResult | { error: string }> = {}
  // Roda em série para preservar 1 query de catálogo em cache. Para volumes
  // maiores (>20 itens) vale otimizar pre-carregando catálogo uma vez.
  for (const p of args.procedures) {
    out[p.key] = await checkProcedureCoverage({
      patientId:     args.patientId,
      stockItemId:   p.stockItemId,
      procedureName: p.procedureName,
    })
  }
  return out
}
