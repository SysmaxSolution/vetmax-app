'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  extractCoverageCore,
  type LlmCoverageResponse,
  type CoverageCategory,
} from '@/lib/ai/coverage-extractor'

// ATENÇÃO (HF 05/06): NUNCA re-exporte tipos de arquivo 'use server' —
// Turbopack registra todo export como server action e o re-export vira
// ReferenceError em runtime (500 em TODAS as actions da rota). Importe
// CoverageCategory direto de '@/lib/ai/coverage-extractor'.

// ─── Data fetching: contexto de cobertura do pet ─────────────────────────────

export interface CoverageRule {
  is_covered:      boolean
  waiting_days:    number
  copay_amount:    number | null
  copay_charger:   'clinic' | 'provider' | null
  /** Pattern textual mais geral da categoria — usado em tooltip. */
  example_pattern: string
}

export interface PetCoverageContext {
  hasPlan:          boolean
  providerName:     string | null
  planType:         string | null
  enrollmentDate:   string | null     // 'YYYY-MM-DD'
  /** Map serializado como Record para passar pelo boundary client/server. */
  coverage:         Record<CoverageCategory, CoverageRule> | Record<string, never>
}

const EMPTY_CONTEXT: PetCoverageContext = {
  hasPlan:        false,
  providerName:   null,
  planType:       null,
  enrollmentDate: null,
  coverage:       {},
}

/**
 * Busca o plano ativo do pet e monta o map (coverage_category → regra)
 * para lookup O(1) no front-end durante a fala. Memoização do lado do
 * caller (useMemo por petId).
 */
export async function getPetCoverageContext(
  patientId: string,
): Promise<PetCoverageContext> {
  if (!patientId) return EMPTY_CONTEXT

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return EMPTY_CONTEXT

  const admin = createAdminClient()

  // 1) Plano ativo do pet — escolhe o mais recente quando há múltiplos.
  const { data: ins } = await admin
    .from('pet_insurance')
    .select('provider_id, plan_type, enrollment_date, coverage_status, insurance_providers(name)')
    .eq('patient_id', patientId)
    .eq('coverage_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!ins?.provider_id || !ins.plan_type) return EMPTY_CONTEXT

  // 2) Regras de cobertura desse plano. Reduz para 1 regra por categoria
  // (a primeira encontrada ordenada por procedure_pattern serve como exemplo).
  const { data: rules } = await admin
    .from('insurance_plan_coverage')
    .select('coverage_category, procedure_pattern, is_covered, waiting_days, copay_amount, copay_charger')
    .eq('provider_id', ins.provider_id)
    .eq('plan_type', ins.plan_type)
    .order('procedure_pattern', { ascending: true })

  const coverage: Record<string, CoverageRule> = {}
  for (const row of (rules ?? [])) {
    const cat = row.coverage_category as CoverageCategory
    if (coverage[cat]) continue   // primeira pattern já registrada para a categoria
    coverage[cat] = {
      is_covered:      Boolean(row.is_covered),
      waiting_days:    Number(row.waiting_days ?? 0),
      copay_amount:    row.copay_amount === null ? null : Number(row.copay_amount),
      copay_charger:   (row.copay_charger as 'clinic' | 'provider' | null) ?? null,
      example_pattern: row.procedure_pattern as string,
    }
  }

  const provider = Array.isArray(ins.insurance_providers)
    ? ins.insurance_providers[0]
    : ins.insurance_providers

  return {
    hasPlan:        true,
    providerName:   (provider as { name?: string } | null)?.name ?? null,
    planType:       ins.plan_type,
    enrollmentDate: (ins.enrollment_date as string | null) ?? null,
    coverage,
  }
}

// ─── LLM extraction (server action) ──────────────────────────────────────────

/**
 * Wrapper auth-checked do core. Devolve sempre a forma validada ou null.
 * Caller (hook) deve usar AbortController para cancelar chamadas obsoletas
 * — o signal NÃO é passado por server action, então a cancelation funciona
 * apenas client-side, abortando o fetch antes do round-trip completar.
 */
export async function extractProcedureFromTranscript(
  text: string,
): Promise<LlmCoverageResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return extractCoverageCore(text)
}
