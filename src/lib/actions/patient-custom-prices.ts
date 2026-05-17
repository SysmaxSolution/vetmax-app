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
      id, patient_id, stock_item_id, custom_price, source, provider_id,
      last_seen_at, observation_count, notes,
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
      source:            row.source as PatientCustomPrice['source'],
      provider_id:       row.provider_id,
      provider_name:     provider?.name ?? null,
      last_seen_at:      row.last_seen_at,
      observation_count: row.observation_count,
      notes:             row.notes,
    }
  })
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
