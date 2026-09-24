'use server'

// Resultados de exame (Fase 2). Entrada manual + import HL7 (quando o aparelho
// interfacear) + CONFERÊNCIA e LIBERAÇÃO pelo MV (item 2.4). Rascunho é editável;
// liberado é imutável e fica disponível para o laudo/tutor.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { parseHL7ORU } from '@/lib/lab/hl7-parser'
import { resolveAnalyte, normKey, type AnalyteMapping } from '@/lib/lab/analyte-resolve'
import { notifyTutorResultReleased } from '@/lib/actions/tutor-portal'
import { usesExamRejectionFlow } from '@/lib/exams/rejection-gate'
import { clinicFlowFlag, routineOffError } from '@/lib/clinic/flow-gate'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  const admin = createAdminClient()
  // Gate da rotina (Tarefa 0): flow_config.usa_laboratorio, padrão desligado.
  if (!(await clinicFlowFlag(admin, profile.clinic_id as string, 'usa_laboratorio'))) {
    return { error: routineOffError('O Laboratório').error }
  }
  return { admin, clinic_id: profile.clinic_id as string, user_id: user.id, role: (profile.role as string) ?? 'staff' }
}

export interface ExamResultRow {
  id: string; panel: string | null; analyte_name: string; value_text: string
  unit: string | null; ref_text: string | null; flag: string | null
  status: string; source: string
}

export interface ExamResultInput {
  panel?: string | null; analyte_name: string; value_text: string
  unit?: string | null; ref_low?: number | null; ref_high?: number | null
  ref_text?: string | null; flag?: string | null
}

export async function listExamResults(consultationId: string): Promise<{ draft: ExamResultRow[]; released: ExamResultRow[] } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const { data, error } = await ctx.admin
    .from('exam_results')
    .select('id, panel, analyte_name, value_text, unit, ref_text, flag, status, source')
    .eq('clinic_id', ctx.clinic_id).eq('consultation_id', consultationId)
    .order('panel', { ascending: true }).order('created_at', { ascending: true })
  if (error) return { error: error.message }
  const rows = (data ?? []) as ExamResultRow[]
  return { draft: rows.filter(r => r.status === 'draft'), released: rows.filter(r => r.status === 'released') }
}

// Substitui os resultados em RASCUNHO da consulta (os liberados são imutáveis).
export async function saveExamResults(consultationId: string, analytes: ExamResultInput[]): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!consultationId) return { error: 'Consulta obrigatória.' }

  await ctx.admin.from('exam_results').delete()
    .eq('clinic_id', ctx.clinic_id).eq('consultation_id', consultationId).eq('status', 'draft')

  const clean = analytes.filter(a => a.analyte_name?.trim() && String(a.value_text ?? '').trim())
  if (clean.length > 0) {
    const rows = clean.map(a => ({
      clinic_id: ctx.clinic_id, consultation_id: consultationId,
      panel: a.panel?.trim() || null, analyte_name: a.analyte_name.trim(),
      value_text: String(a.value_text).trim(), unit: a.unit?.trim() || null,
      ref_low: a.ref_low ?? null, ref_high: a.ref_high ?? null, ref_text: a.ref_text?.trim() || null,
      flag: a.flag || null, status: 'draft', source: 'manual', created_by: ctx.user_id,
    }))
    const { error } = await ctx.admin.from('exam_results').insert(rows)
    if (error) return { error: 'Erro ao salvar resultados: ' + error.message }
  }
  revalidatePath(`/dashboard/exams/${consultationId}`)
  return { ok: true }
}

// Importa resultados de uma mensagem HL7 (ORU) do aparelho → rascunho.
export async function importHL7Results(consultationId: string, hl7: string): Promise<{ ok: true; count: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const parsed = parseHL7ORU(hl7)
  if ('error' in parsed) return { error: parsed.error }
  if (parsed.analytes.length === 0) return { error: 'Nenhum resultado (OBX) encontrado na mensagem.' }

  // De-para código do aparelho → analito do catálogo (não bloqueia se não mapeado).
  const { data: maps } = await ctx.admin
    .from('lab_analyte_mappings').select('analyte_id, device_code, device_name, lab_agent_id')
    .eq('clinic_id', ctx.clinic_id)
  const mappings = (maps ?? []) as AnalyteMapping[]
  // Anexa a curva/gráfico (ED) ao 1º analito casado por código, quando houver.
  const graphByCode = new Map<string, unknown>()
  for (const g of parsed.graphs) if (g.code) graphByCode.set(normKey(g.code), { kind: g.name, mime: g.mime, encoding: g.encoding, data: g.data })

  const rows = parsed.analytes.map(a => ({
    clinic_id: ctx.clinic_id, consultation_id: consultationId,
    panel: parsed.panel, analyte_code: a.code, analyte_name: a.name,
    analyte_id: resolveAnalyte(a.code, a.name, mappings),
    value_text: a.value, unit: a.unit, ref_low: a.ref_low, ref_high: a.ref_high,
    ref_text: a.ref_text, flag: a.flag, status: 'draft', source: 'hl7', created_by: ctx.user_id,
    graph_data: a.code && graphByCode.has(normKey(a.code)) ? graphByCode.get(normKey(a.code)) : null,
    raw_hl7: hl7.length <= 20000 ? hl7 : null,
  }))
  const { error } = await ctx.admin.from('exam_results').insert(rows)
  if (error) return { error: 'Erro ao importar HL7: ' + error.message }
  revalidatePath(`/dashboard/exams/${consultationId}`)
  return { ok: true, count: rows.length }
}

// 2.4 — CONFERÊNCIA E LIBERAÇÃO pelo Médico Veterinário. Só MV/admin.
export async function releaseExamResults(consultationId: string): Promise<{ ok: true; released: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!['vet', 'admin', 'owner', 'manager'].includes(ctx.role)) {
    return { error: 'Apenas o Médico Veterinário pode liberar o resultado.' }
  }
  const { data, error } = await ctx.admin.from('exam_results')
    .update({ status: 'released', released_by: ctx.user_id, released_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('clinic_id', ctx.clinic_id).eq('consultation_id', consultationId).eq('status', 'draft')
    .select('id')
  if (error) return { error: 'Erro ao liberar: ' + error.message }
  const released = (data ?? []).length

  // Fluxo de Rejeição de Exame (opt-in): liberar o resultado é o gatilho da
  // cobrança. As linhas de exame ainda travadas viram 'performed', perdem a
  // trava e são enviadas ao caixa. As linhas rejeitadas/encerradas NÃO são
  // tocadas — continuam fora da cobrança. Com a flag desligada nada disso roda.
  if (released > 0 && await usesExamRejectionFlow(ctx.admin, ctx.clinic_id)) {
    const now = new Date().toISOString()
    const { data: freed } = await ctx.admin
      .from('consultation_services')
      .update({ exam_state: 'performed', exam_billing_hold_at: null, updated_at: now })
      .eq('clinic_id', ctx.clinic_id)
      .eq('consultation_id', consultationId)
      .is('cancelled_at', null)
      .is('billed_in_invoice_id', null)
      .not('exam_billing_hold_at', 'is', null)
      .in('exam_state', ['pending'])
      .select('id')
    if ((freed ?? []).length > 0) {
      try {
        const { sendToCashier } = await import('./vet')
        await sendToCashier(consultationId)
      } catch { /* best-effort: a fatura final varre o que sobrar */ }
    }
  }

  // Avisa o tutor por WhatsApp (best-effort; só se a clínica usa o portal)
  if (released > 0) {
    try {
      const { data: cons } = await ctx.admin
        .from('consultations').select('patient_id, patients!patient_id ( tutor_id, name )')
        .eq('id', consultationId).maybeSingle()
      const pat = (cons as any)?.patients
      const p = Array.isArray(pat) ? pat[0] : pat
      if (p?.tutor_id) await notifyTutorResultReleased(p.tutor_id, p.name ?? 'seu pet')
    } catch { /* best-effort */ }
  }

  revalidatePath(`/dashboard/exams/${consultationId}`)
  return { ok: true, released }
}
