'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TemplateItem {
  medication_name:   string
  dose:              string | null
  route:             string | null
  frequency_hours:   number | null
  duration_hours:    number | null
  notes:             string | null
  stock_item_id:     string | null
  quantity_per_dose: number | null
}

export interface PrescriptionTemplateSummary {
  id:          string
  name:        string
  description: string | null
  item_count:  number
}

export interface PrescriptionTemplate extends PrescriptionTemplateSummary {
  items: TemplateItem[]
}

export interface CreateTemplatePayload {
  name:        string
  description?: string | null
  items:       TemplateItem[]
}

async function getCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

const NUM = (v: number | null | undefined): number | null =>
  v === null || v === undefined || Number.isNaN(v) ? null : Number(v)

// ─── List ────────────────────────────────────────────────────────────────────

export async function listPrescriptionTemplates(): Promise<PrescriptionTemplateSummary[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('prescription_templates')
    .select('id, name, description, prescription_template_items(count)')
    .eq('clinic_id', ctx.clinicId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) return { error: error.message }
  return (data ?? []).map((r): PrescriptionTemplateSummary => ({
    id:          r.id as string,
    name:        r.name as string,
    description: (r.description as string | null) ?? null,
    item_count:  Number((r.prescription_template_items as { count: number }[] | null)?.[0]?.count ?? 0),
  }))
}

// ─── Get (com itens) ──────────────────────────────────────────────────────────

export async function getPrescriptionTemplate(id: string): Promise<PrescriptionTemplate | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: tpl, error } = await admin
    .from('prescription_templates')
    .select('id, name, description')
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
    .single()
  if (error || !tpl) return { error: 'Protocolo não encontrado.' }

  const { data: items } = await admin
    .from('prescription_template_items')
    .select('medication_name, dose, route, frequency_hours, duration_hours, notes, stock_item_id, quantity_per_dose')
    .eq('template_id', id)
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })

  return {
    id:          tpl.id as string,
    name:        tpl.name as string,
    description: (tpl.description as string | null) ?? null,
    item_count:  (items ?? []).length,
    items: (items ?? []).map((i): TemplateItem => ({
      medication_name:   i.medication_name as string,
      dose:              (i.dose  as string | null) ?? null,
      route:             (i.route as string | null) ?? null,
      frequency_hours:   i.frequency_hours === null ? null : Number(i.frequency_hours),
      duration_hours:    i.duration_hours  === null ? null : Number(i.duration_hours),
      notes:             (i.notes as string | null) ?? null,
      stock_item_id:     (i.stock_item_id as string | null) ?? null,
      quantity_per_dose: i.quantity_per_dose === null ? null : Number(i.quantity_per_dose),
    })),
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createPrescriptionTemplate(payload: CreateTemplatePayload): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.name?.trim()) return { error: 'Informe o nome do protocolo.' }
  const items = (payload.items ?? []).filter(i => i.medication_name?.trim())
  if (items.length === 0) return { error: 'Adicione ao menos uma medicação ao protocolo.' }

  const admin = createAdminClient()
  const { data: tpl, error: tplErr } = await admin
    .from('prescription_templates')
    .insert({
      clinic_id:   ctx.clinicId,
      name:        payload.name.trim(),
      description: payload.description?.trim() || null,
      created_by:  ctx.userId,
    })
    .select('id')
    .single()
  if (tplErr) return { error: 'Erro ao criar protocolo: ' + tplErr.message }

  const templateId = tpl.id as string
  const rows = items.map((i, idx) => ({
    clinic_id:         ctx.clinicId,
    template_id:       templateId,
    medication_name:   i.medication_name.trim(),
    dose:              i.dose?.trim() || null,
    route:             i.route?.trim() || null,
    frequency_hours:   NUM(i.frequency_hours),
    duration_hours:    NUM(i.duration_hours),
    notes:             i.notes?.trim() || null,
    stock_item_id:     i.stock_item_id ?? null,
    quantity_per_dose: NUM(i.quantity_per_dose),
    sort_order:        idx,
  }))
  const { error: itErr } = await admin.from('prescription_template_items').insert(rows)
  if (itErr) {
    // rollback best-effort do cabeçalho órfão
    await admin.from('prescription_templates').delete().eq('id', templateId)
    return { error: 'Erro ao salvar itens do protocolo: ' + itErr.message }
  }

  revalidatePath('/dashboard/hospitalization')
  return { id: templateId }
}

export async function deletePrescriptionTemplate(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  // Soft-delete: preserva histórico, some da lista.
  const { error } = await admin
    .from('prescription_templates')
    .update({ is_active: false })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

// ─── Aplicar protocolo (unroll 1-clique) ──────────────────────────────────────

/**
 * Aplica um protocolo a uma internação: cria uma hospitalization_prescription
 * por item do protocolo (status 'active', started_at=now). O Mapa de Execução
 * deriva os horários de cada item a partir de started_at + frequency_hours.
 */
export async function applyTemplateToHospitalization(
  templateId: string,
  hospitalizationId: string,
  startedAt?: string,
): Promise<{ count: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!hospitalizationId) return { error: 'hospitalization_id é obrigatório.' }
  if (startedAt && Number.isNaN(Date.parse(startedAt))) {
    return { error: 'Horário de início do protocolo inválido.' }
  }

  const admin = createAdminClient()

  // Confere que a internação é da clínica (defesa em profundidade).
  const { data: hosp } = await admin
    .from('hospitalizations')
    .select('id')
    .eq('id', hospitalizationId)
    .eq('clinic_id', ctx.clinicId)
    .single()
  if (!hosp) return { error: 'Internação não encontrada.' }

  const { data: items } = await admin
    .from('prescription_template_items')
    .select('medication_name, dose, route, frequency_hours, duration_hours, notes, stock_item_id, quantity_per_dose')
    .eq('template_id', templateId)
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })

  if (!items || items.length === 0) return { error: 'Protocolo sem itens para aplicar.' }

  const started = startedAt || new Date().toISOString()
  const rows = items.map(i => ({
    clinic_id:          ctx.clinicId,
    hospitalization_id: hospitalizationId,
    medication_name:    i.medication_name as string,
    dose:               (i.dose  as string | null) ?? null,
    route:              (i.route as string | null) ?? null,
    frequency_hours:    i.frequency_hours === null ? null : Number(i.frequency_hours),
    duration_hours:     i.duration_hours  === null ? null : Number(i.duration_hours),
    started_at:         started,
    notes:              (i.notes as string | null) ?? null,
    prescribed_by:      ctx.userId,
    status:             'active',
    stock_item_id:      (i.stock_item_id as string | null) ?? null,
    quantity_per_dose:  i.quantity_per_dose === null ? null : Number(i.quantity_per_dose),
  }))

  const { error } = await admin.from('hospitalization_prescriptions').insert(rows)
  if (error) return { error: 'Erro ao aplicar protocolo: ' + error.message }

  revalidatePath('/dashboard/hospitalization')
  return { count: rows.length }
}
