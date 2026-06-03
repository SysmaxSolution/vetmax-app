'use server'

/**
 * Microchipping — fluxo simplificado (Item 4, sprint 2026-06-02).
 *
 * Salva os 4 campos (chip number, fabricante, lote, validade), atualiza
 * patients.microchip_id (chip ativo), lança o serviço "Microchipagem" do
 * catálogo na consulta (split convênio Item 5 entra automaticamente em
 * addServiceToConsultation), gera a fatura/Caixa Central e fecha a consulta.
 *
 * Action única chamada pelo MicrochipPanel ao clicar "Salvar e Finalizar".
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { addServiceToConsultation } from '@/lib/actions/services'
import { generateInvoice } from '@/lib/actions/billing'

type Ctx =
  | { admin: ReturnType<typeof createAdminClient>; clinic_id: string; user_id: string }
  | { error: string }

async function getCtx(): Promise<Ctx> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { admin, clinic_id: profile.clinic_id as string, user_id: user.id }
}

/**
 * Localiza o serviço "Microchipagem" no catálogo. Tenta nesta ordem:
 *   1) SKU exato 'MICROCHIPAGEM'
 *   2) name ILIKE '%microchip%' + is_service=true (mais permissivo)
 * Retorna null quando não há cadastro — caller mostra orientação para
 * o admin cadastrar em Estoque > Serviços.
 */
export async function findMicrochippingService(): Promise<{ id: string; name: string } | null | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data: bySku } = await admin
    .from('stock_items')
    .select('id, name')
    .eq('clinic_id', clinic_id)
    .eq('is_service', true)
    .eq('sku', 'MICROCHIPAGEM')
    .is('archived_at', null)
    .maybeSingle()
  if (bySku) return { id: bySku.id as string, name: bySku.name as string }

  const { data: byName } = await admin
    .from('stock_items')
    .select('id, name')
    .eq('clinic_id', clinic_id)
    .eq('is_service', true)
    .is('archived_at', null)
    .ilike('name', '%microchip%')
    .limit(1)
    .maybeSingle()
  if (byName) return { id: byName.id as string, name: byName.name as string }

  return null
}

export interface SaveMicrochipInput {
  consultation_id: string
  chip_number?:   string | null
  manufacturer?:  string | null
  batch_number?:  string | null
  expiry_date?:   string | null   // ISO yyyy-mm-dd
  notes?:         string | null
  /**
   * 'finalize' (default): fecha consulta + gera invoice no caixa.
   * 'continue': salva chip + serviço, muda visit_reason p/ 'consultation' e
   *             deixa status='in_progress' para o vet seguir o atendimento
   *             clínico no consultório (medicação, procedimento, etc).
   *             A fatura será gerada pelo fluxo normal ao finalizar a consulta.
   */
  mode?:          'finalize' | 'continue'
}

/**
 * Pipeline completo do fluxo microchipping. Idempotente parcialmente: salvar
 * de novo após erro intermediário não duplica o serviço no caixa (a action
 * generateInvoice já é guard-protegida por "uma fatura por consulta").
 */
export async function saveMicrochipAndFinalize(
  input: SaveMicrochipInput,
): Promise<{
  success:     true
  microchip_id:string
  invoice_id?: string
  warning?:    string
  /** 'finalize' = consulta encerrada; 'continue' = vet segue no consultório. */
  mode:        'finalize' | 'continue'
} | { error: string }> {
  const mode = input.mode ?? 'finalize'
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id, user_id } = ctx

  if (!input.consultation_id) return { error: 'consultation_id obrigatório.' }

  // 1) Carrega a consulta e valida que é microchipping da própria clínica
  const { data: consult } = await admin
    .from('consultations')
    .select('id, clinic_id, patient_id, visit_reason, status')
    .eq('id', input.consultation_id)
    .eq('clinic_id', clinic_id)
    .maybeSingle()
  if (!consult)                                return { error: 'Consulta não encontrada.' }
  if (consult.visit_reason !== 'microchipping') return { error: 'Esta consulta não é de microchipagem.' }
  if (consult.status === 'completed')          return { error: 'Esta consulta já foi finalizada.' }
  if (consult.status === 'cancelled')          return { error: 'Esta consulta foi cancelada.' }

  const patient_id = consult.patient_id as string

  // 2) Localiza o serviço Microchipagem no catálogo (necessário para o caixa)
  const svc = await findMicrochippingService()
  if (svc && 'error' in svc) return svc
  if (!svc) {
    return {
      error: 'Cadastre o serviço "Microchipagem" em Estoque > Serviços (SKU "MICROCHIPAGEM") antes de fechar este atendimento.',
    }
  }

  // 3) Insert em microchip_records (histórico permanente)
  const chipNumber = (input.chip_number ?? '').trim() || null
  const { data: rec, error: recErr } = await admin
    .from('microchip_records')
    .insert({
      clinic_id,
      patient_id,
      consultation_id: consult.id,
      chip_number:     chipNumber,
      manufacturer:    (input.manufacturer ?? '').trim() || null,
      batch_number:    (input.batch_number ?? '').trim() || null,
      expiry_date:     input.expiry_date || null,
      implanted_at:    new Date().toISOString(),
      implanted_by:    user_id,
      notes:           (input.notes ?? '').trim() || null,
    })
    .select('id')
    .single()
  if (recErr || !rec) return { error: 'Erro ao salvar microchip: ' + (recErr?.message ?? '') }

  // 4) Atualiza patients.microchip_id (chip ATIVO) — só sobrescreve se tiver número
  if (chipNumber) {
    await admin
      .from('patients')
      .update({ microchip_id: chipNumber })
      .eq('id', patient_id)
      .eq('clinic_id', clinic_id)
  }

  // 5) Lança serviço "Microchipagem" na consulta — addServiceToConsultation
  //    chama resolveServicePricing internamente: quando o pet tem convênio,
  //    o split copay/repass do Item 5 entra automaticamente.
  const svcRes = await addServiceToConsultation({
    consultation_id: consult.id,
    stock_item_id:   svc.id,
    quantity:        1,
    added_at_stage:  'vet',
  })
  if ('error' in svcRes) {
    return { error: 'Microchip salvo, mas falha ao lançar serviço no caixa: ' + svcRes.error }
  }

  // 6) Atualiza a consulta. Difere por modo:
  //    - 'finalize': fecha (status='completed', is_reviewed_by_vet=true) + vet_notes auto
  //    - 'continue': mantém aberta (status='in_progress'), muda visit_reason='consultation'
  //                  para o ConsultationDetail renderizar o prontuário completo. vet_notes
  //                  recebe a nota da microchipagem como rascunho — vet pode editar.
  const autoNote = [
    'Microchipagem realizada via fluxo simplificado.',
    chipNumber                   && `Chip nº ${chipNumber}.`,
    input.manufacturer?.trim()   && `Fabricante: ${input.manufacturer.trim()}.`,
    input.batch_number?.trim()   && `Lote: ${input.batch_number.trim()}.`,
    input.expiry_date            && `Validade: ${input.expiry_date}.`,
  ].filter(Boolean).join(' ')

  const updatePayload: Record<string, unknown> = {
    vet_notes:  autoNote,
    vet_id:     user_id,
    updated_at: new Date().toISOString(),
  }
  if (mode === 'finalize') {
    updatePayload.status             = 'completed'
    updatePayload.is_reviewed_by_vet = true
  } else {
    updatePayload.status        = 'in_progress'
    updatePayload.visit_reason  = 'consultation'
  }

  const { error: closeErr } = await admin
    .from('consultations')
    .update(updatePayload)
    .eq('id', consult.id)
    .eq('clinic_id', clinic_id)
  if (closeErr) {
    return {
      success:      true,
      microchip_id: rec.id as string,
      mode,
      warning:      'Microchip e serviço gravados, mas a consulta não atualizou automaticamente: ' + closeErr.message,
    }
  }

  // 7) Fatura: só no modo 'finalize'. No 'continue', o vet vai gerar pelo fluxo
  //    normal ao finalizar a consulta clínica.
  let invoiceId: string | undefined
  let invoiceWarn: string | undefined
  if (mode === 'finalize') {
    const inv = await generateInvoice(consult.id)
    if ('error' in inv) {
      invoiceWarn = 'Consulta fechada, mas geração da fatura falhou: ' + inv.error
    } else {
      invoiceId = inv.id
    }
  }

  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/vet')
  revalidatePath(`/dashboard/vet/${consult.id}`)
  revalidatePath('/dashboard/cashier')
  revalidatePath(`/dashboard/patients/${patient_id}`)

  return {
    success:      true,
    microchip_id: rec.id as string,
    invoice_id:   invoiceId,
    warning:      invoiceWarn,
    mode,
  }
}

// ─── Helpers para a UI ────────────────────────────────────────────────────────

export interface MicrochipHistoryRow {
  id:             string
  chip_number:    string | null
  manufacturer:   string | null
  batch_number:   string | null
  expiry_date:    string | null
  implanted_at:   string
  implanted_by_name: string | null
}

export async function listMicrochipHistoryForPatient(
  patient_id: string,
): Promise<MicrochipHistoryRow[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { admin, clinic_id } = ctx

  const { data, error } = await admin
    .from('microchip_records')
    .select('id, chip_number, manufacturer, batch_number, expiry_date, implanted_at, profiles!microchip_records_implanted_by_fkey(full_name)')
    .eq('clinic_id', clinic_id)
    .eq('patient_id', patient_id)
    .order('implanted_at', { ascending: false })
  if (error) return { error: error.message }

  return (data ?? []).map((r: any): MicrochipHistoryRow => ({
    id:                r.id,
    chip_number:       r.chip_number,
    manufacturer:      r.manufacturer,
    batch_number:      r.batch_number,
    expiry_date:       r.expiry_date,
    implanted_at:      r.implanted_at,
    implanted_by_name: r.profiles?.full_name ?? null,
  }))
}
