'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientCustomPrice {
  id:                 string
  patient_id:         string
  stock_item_id:      string
  stock_item_name:    string
  custom_price:       number
  copay_amount:       number | null
  repass_amount:      number | null
  source:             'manual' | 'petlove_remittance' | 'other_insurance'
  provider_id:        string | null
  provider_name:      string | null
  last_seen_at:       string
  observation_count:  number
  notes:              string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ClinicCtx = {
  supabase: ReturnType<typeof createAdminClient>
  clinicId: string
}

async function getCtx(): Promise<ClinicCtx | { error: string }> {
  const supabaseSSR = await createClient()
  const { data: { user } } = await supabaseSSR.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }
  return { supabase: admin, clinicId: profile.clinic_id }
}

// ─── patientHasInsurance ──────────────────────────────────────────────────────
// Verifica se o pet tem pet_insurance ativo. Usado para mostrar a aba
// "Preços do Convênio" apenas quando faz sentido.
export async function patientHasInsurance(patientId: string): Promise<{
  has_insurance: boolean
  provider_name: string | null
  plan_type:     string | null
} | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data } = await supabase
    .from('pet_insurance')
    .select('plan_type, insurance_providers(name)')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .eq('coverage_status', 'active')
    .maybeSingle()

  if (!data) return { has_insurance: false, provider_name: null, plan_type: null }
  const provider = data.insurance_providers as unknown as { name: string } | null
  return {
    has_insurance: true,
    provider_name: provider?.name ?? null,
    plan_type:     data.plan_type ?? null,
  }
}

// ─── getPetlovePatientHistory ─────────────────────────────────────────────────
// Eventos auditáveis vindos da conciliação para este pet.
export interface PetlovePatientHistoryEvent {
  id:           string
  event_type:   'patient_created' | 'plan_updated' | 'price_updated' | 'entry_created'
  description:  string
  metadata:     Record<string, unknown>
  created_at:   string
}

export async function getPetlovePatientHistory(
  patientId: string,
): Promise<PetlovePatientHistoryEvent[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('patient_petlove_history')
    .select('id, event_type, description, metadata, created_at')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { error: error.message }
  return (data ?? []).map(r => ({
    id:          r.id,
    event_type:  r.event_type as PetlovePatientHistoryEvent['event_type'],
    description: r.description,
    metadata:    (r.metadata as Record<string, unknown>) ?? {},
    created_at:  r.created_at,
  }))
}

// ─── getCustomPricesForPatient ────────────────────────────────────────────────
// Lê a matriz de preços fixados deste pet. Usado pelo cadastro do pet e por
// telas que iniciam um novo atendimento (recepção, vet) para sugerir o preço
// exato do contrato anual em vez do preço de tabela.

export async function getCustomPricesForPatient(
  patientId: string,
): Promise<PatientCustomPrice[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('patient_custom_prices')
    .select(`
      id, patient_id, stock_item_id, custom_price, copay_amount, repass_amount,
      source, provider_id, last_seen_at, observation_count, notes,
      stock_items ( name ),
      insurance_providers ( name )
    `)
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('last_seen_at', { ascending: false })

  if (error) return { error: error.message }

  return (data ?? []).map(row => {
    const stockItems = row.stock_items as unknown as { name: string } | null
    const provider   = row.insurance_providers as unknown as { name: string } | null
    return {
      id:                row.id,
      patient_id:        row.patient_id,
      stock_item_id:     row.stock_item_id,
      stock_item_name:   stockItems?.name ?? '(item removido)',
      custom_price:      Number(row.custom_price),
      copay_amount:      row.copay_amount === null ? null : Number(row.copay_amount),
      repass_amount:     row.repass_amount === null ? null : Number(row.repass_amount),
      source:            row.source as PatientCustomPrice['source'],
      provider_id:       row.provider_id,
      provider_name:     provider?.name ?? null,
      last_seen_at:      row.last_seen_at,
      observation_count: row.observation_count,
      notes:             row.notes,
    }
  })
}

// ─── upsertPatientCustomPrice (CRUD direto na aba Convênio do pet) ────────────
// Cria/atualiza um custom_price manualmente, fora do consultório. Valida coerência
// copay + repass ≈ custom_price (constraint do banco já valida, mas erramos antes
// pra dar mensagem clara). source='manual'.

export async function upsertPatientCustomPrice(input: {
  patient_id:     string
  stock_item_id:  string
  custom_price:   number
  copay_amount:   number
  repass_amount:  number
  provider_id?:   string | null
  notes?:         string | null
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const total = Number((input.copay_amount + input.repass_amount).toFixed(2))
  const target = Number(input.custom_price.toFixed(2))
  if (Math.abs(total - target) > 0.01) {
    return { error: `Coparticipação (R$ ${input.copay_amount.toFixed(2)}) + Repasse (R$ ${input.repass_amount.toFixed(2)}) deve somar R$ ${target.toFixed(2)}.` }
  }
  if (input.copay_amount < 0 || input.repass_amount < 0 || input.custom_price <= 0) {
    return { error: 'Valores devem ser positivos e total maior que zero.' }
  }

  const { data, error } = await supabase
    .from('patient_custom_prices')
    .upsert({
      clinic_id:         clinicId,
      patient_id:        input.patient_id,
      stock_item_id:     input.stock_item_id,
      custom_price:      input.custom_price,
      copay_amount:      input.copay_amount,
      repass_amount:     input.repass_amount,
      provider_id:       input.provider_id ?? null,
      source:            'manual',
      last_seen_at:      new Date().toISOString(),
      observation_count: 1,
      notes:             input.notes ?? null,
      updated_at:        new Date().toISOString(),
    }, {
      onConflict: 'clinic_id,patient_id,stock_item_id',
    })
    .select('id')
    .single()

  if (error || !data) return { error: 'Erro ao salvar preço: ' + (error?.message ?? '') }

  try {
    await supabase.from('patient_petlove_history').insert({
      clinic_id:   clinicId,
      patient_id:  input.patient_id,
      event_type:  'price_updated',
      description: `Preço fixado manualmente no cadastro do pet (tutor R$ ${input.copay_amount.toFixed(2)} + plano R$ ${input.repass_amount.toFixed(2)} = R$ ${input.custom_price.toFixed(2)})`,
      metadata: {
        stock_item_id:  input.stock_item_id,
        custom_price:   input.custom_price,
        copay_amount:   input.copay_amount,
        repass_amount:  input.repass_amount,
        source:         'patient_form_manual',
      },
    })
  } catch { /* audit best-effort */ }

  return { id: data.id as string }
}

// ─── deletePatientCustomPrice ─────────────────────────────────────────────────

export async function deletePatientCustomPrice(
  customPriceId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { error } = await supabase
    .from('patient_custom_prices')
    .delete()
    .eq('id', customPriceId)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao remover preço: ' + error.message }
  return { success: true }
}

// ─── listClinicServicesForCustomPricing ───────────────────────────────────────
// Lista serviços do catálogo (is_service=true) para preencher o seletor do
// editor de preços do pet. Já filtra por clínica e ordena alfabeticamente.

export interface CatalogService {
  id:                       string
  name:                     string
  unit_price:               number
  default_insurance_price:  number | null
  accepted_provider_ids:    string[]
}

export async function listClinicServicesForCustomPricing(): Promise<CatalogService[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('stock_items')
    .select(`
      id, name, unit_price, default_insurance_price,
      stock_item_insurance_providers ( insurance_provider_id )
    `)
    .eq('clinic_id', clinicId)
    .eq('is_service', true)
    .is('archived_at', null)
    .order('name', { ascending: true })

  if (error) {
    // Fallback se a tabela de junção ainda não existir (migration 0217 pendente)
    const { data: fb, error: err2 } = await supabase
      .from('stock_items')
      .select('id, name, unit_price, default_insurance_price')
      .eq('clinic_id', clinicId)
      .eq('is_service', true)
      .is('archived_at', null)
      .order('name', { ascending: true })
    if (err2 || !fb) return { error: err2?.message ?? error.message }
    return fb.map((r: any) => ({
      id:                      r.id,
      name:                    r.name,
      unit_price:              Number(r.unit_price ?? 0),
      default_insurance_price: r.default_insurance_price === null ? null : Number(r.default_insurance_price),
      accepted_provider_ids:   [],
    }))
  }

  return (data ?? []).map((r: any) => ({
    id:                      r.id,
    name:                    r.name,
    unit_price:              Number(r.unit_price ?? 0),
    default_insurance_price: r.default_insurance_price === null ? null : Number(r.default_insurance_price),
    accepted_provider_ids:   (r.stock_item_insurance_providers ?? []).map((x: any) => x.insurance_provider_id),
  }))
}

// ─── suggestPriceForPatientItem ───────────────────────────────────────────────
// Helper rápido para checkout/atendimento — recebe pet + item, retorna preço
// sugerido (custom_price se existir, senão null).

export async function suggestPriceForPatientItem(
  patientId: string,
  stockItemId: string,
): Promise<{ custom_price: number; source: PatientCustomPrice['source']; provider_name: string | null } | null | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('patient_custom_prices')
    .select(`
      custom_price, source,
      insurance_providers ( name )
    `)
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .eq('stock_item_id', stockItemId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return null

  const provider = data.insurance_providers as unknown as { name: string } | null
  return {
    custom_price:  Number(data.custom_price),
    source:        data.source as PatientCustomPrice['source'],
    provider_name: provider?.name ?? null,
  }
}
