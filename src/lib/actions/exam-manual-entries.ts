'use server'

// Digitação do laboratório: o que NÃO vem do aparelho.
//
// A Amanda (Clínica Animais) descreveu o fluxo real: de MIELÓCITOS a MONÓCITOS
// o diferencial sai da LÂMINA, no microscópio, e é digitado; a contagem
// plaquetária às vezes é corrigida à mão; e há campos que são só texto.
//
// Fica em `exam_manual_entries`, separado de `exam_results`, de propósito: a
// origem do dado precisa continuar distinguível no prontuário — o que o
// analisador mediu não se mistura com o que uma pessoa digitou.
//
// Só funciona enquanto o resultado está em RASCUNHO. Depois de liberado pelo
// Médico Veterinário o laudo é imutável, e isto respeita essa regra.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { clinicFlowFlag, routineOffError } from '@/lib/clinic/flow-gate'
import {
  applyReferenceSet, pickReferenceSet,
  type ReferenceSet, type ResolvedRow,
} from '@/lib/lab/reference-set'
import type { HL7Analyte } from '@/lib/lab/hl7-parser'

import { mensagemErro } from '@/lib/errors'
async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  const admin = createAdminClient()
  if (!(await clinicFlowFlag(admin, profile.clinic_id as string, 'usa_laboratorio'))) {
    return { error: routineOffError('O Laboratório').error }
  }
  return { admin, clinic_id: profile.clinic_id as string, user_id: user.id, role: (profile.role as string) ?? 'staff' }
}

export interface ManualField {
  item_id:  string
  label:    string
  section:  string
  source:   'slide' | 'text' | 'device'
  unit:     string | null
  ref:      string | null
  ref_abs:  string | null
  /** O que já está digitado (ou o texto padrão, quando ninguém mexeu). */
  value:    string | null
  /** O que o APARELHO mandou — só nas linhas em que ele mede. Serve de conferência. */
  device_value: string | null
  overridden:   boolean
}

export interface ManualEntriesView {
  /** Nome do conjunto de referência em uso (a tabela da clínica). */
  set_name: string
  species:  string | null
  fields:   ManualField[]
  /** true = laudo já liberado; nada mais se digita. */
  locked:   boolean
}

/** Linhas do laudo que esperam digitação, com o que o aparelho mandou ao lado. */
export async function listManualEntryFields(
  consultationId: string,
): Promise<ManualEntriesView | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!consultationId) return { error: 'Consulta obrigatória.' }

  const { data: cons } = await ctx.admin
    .from('consultations').select('id, patient_id')
    .eq('clinic_id', ctx.clinic_id).eq('id', consultationId).maybeSingle()
  if (!cons) return { error: 'Atendimento não encontrado nesta clínica.' }

  const [{ data: results }, { data: patient }, { data: manuais }] = await Promise.all([
    ctx.admin.from('exam_results')
      .select('analyte_code, analyte_name, value_text, unit, ref_text, ref_low, ref_high, flag, status')
      .eq('clinic_id', ctx.clinic_id).eq('consultation_id', consultationId),
    ctx.admin.from('patients').select('species')
      .eq('clinic_id', ctx.clinic_id).eq('id', cons.patient_id).maybeSingle(),
    ctx.admin.from('exam_manual_entries').select('label, value_text')
      .eq('clinic_id', ctx.clinic_id).eq('consultation_id', consultationId),
  ])

  const rows = results ?? []
  const locked = rows.some(r => (r as { status: string }).status === 'released')

  // Mesma regra do laudo: o exame lógico vem do que foi medido, não do rótulo
  // que o aparelho mandou.
  const { isBiochemAnalyte } = await import('@/lib/lab/biochem-report')
  const analytes: HL7Analyte[] = rows.map(r => ({
    code: (r as { analyte_code: string | null }).analyte_code,
    name: (r as { analyte_name: string }).analyte_name,
    value: (r as { value_text: string }).value_text,
    unit: (r as { unit: string | null }).unit,
    ref_text: (r as { ref_text: string | null }).ref_text,
    ref_low: (r as { ref_low: number | null }).ref_low,
    ref_high: (r as { ref_high: number | null }).ref_high,
    flag: ((r as { flag: string | null }).flag as HL7Analyte['flag']) ?? null,
  }))
  const temHemograma = analytes.some(a => !isBiochemAnalyte(a.code, a.name))
  const panelKey = temHemograma ? 'hemograma' : (analytes.length ? 'bioquimico' : null)
  if (!panelKey) return { set_name: '', species: null, fields: [], locked }

  const { data: sets } = await ctx.admin
    .from('lab_reference_sets')
    .select('id, panel_key, species, name, lab_reference_items(id, sort_order, label, analyte_code, section, input_source, unit, ref_text, ref_low, ref_high, ref_abs_text, ref_abs_low, ref_abs_high, is_visible, is_editable, default_text)')
    .eq('clinic_id', ctx.clinic_id).eq('panel_key', panelKey).eq('is_active', true)

  const conjuntos: ReferenceSet[] = (sets ?? []).map(s => ({
    id: s.id as string,
    panel_key: s.panel_key as string,
    species: (s.species as string) ?? null,
    name: s.name as string,
    items: ((s as { lab_reference_items?: unknown[] }).lab_reference_items ?? []) as ReferenceSet['items'],
  }))
  const escolhido = pickReferenceSet(conjuntos, panelKey, (patient?.species as string) ?? null)
  if (!escolhido) {
    return { set_name: '', species: null, fields: [], locked }
  }

  const digitado: Record<string, string> = {}
  for (const m of manuais ?? []) {
    const v = (m as { value_text: string | null }).value_text
    if (v) digitado[(m as { label: string }).label] = v
  }

  const resolvido = applyReferenceSet(escolhido, analytes, digitado)
  // Sem digitação para comparar: o valor "do aparelho" é o que sairia sem override.
  const semDigitacao = applyReferenceSet(escolhido, analytes, {})
  const porId = new Map(semDigitacao.rows.map(r => [r.item_id, r]))

  const fields: ManualField[] = resolvido.rows
    .filter((r: ResolvedRow) => r.editable)
    .map((r: ResolvedRow) => ({
      item_id: r.item_id, label: r.label, section: r.section,
      source: r.source as ManualField['source'],
      unit: r.unit, ref: r.ref, ref_abs: r.ref_abs,
      value: digitado[r.label] ?? (r.source === 'text' ? r.value : null),
      device_value: r.source === 'device' ? (porId.get(r.item_id)?.value ?? null) : null,
      overridden: r.overridden,
    }))

  return { set_name: resolvido.set_name, species: resolvido.species, fields, locked }
}

/** Grava a digitação. Campo em branco apaga a linha — não guarda vazio à toa. */
export async function saveManualEntries(
  consultationId: string,
  entries: { item_id: string; label: string; value: string }[],
): Promise<{ ok: true; saved: number } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!consultationId) return { error: 'Consulta obrigatória.' }

  const { data: cons } = await ctx.admin
    .from('consultations').select('id')
    .eq('clinic_id', ctx.clinic_id).eq('id', consultationId).maybeSingle()
  if (!cons) return { error: 'Atendimento não encontrado nesta clínica.' }

  // Laudo liberado é imutável — a mesma regra que vale para exam_results.
  const { data: rel } = await ctx.admin.from('exam_results')
    .select('id').eq('clinic_id', ctx.clinic_id).eq('consultation_id', consultationId)
    .eq('status', 'released').limit(1)
  if ((rel ?? []).length > 0) {
    return { error: 'O resultado já foi liberado pelo Médico Veterinário — o laudo não aceita mais alteração.' }
  }

  const agora = new Date().toISOString()
  const comValor = entries.filter(e => String(e.value ?? '').trim() !== '')
  const semValor = entries.filter(e => String(e.value ?? '').trim() === '').map(e => e.label)

  if (semValor.length) {
    await ctx.admin.from('exam_manual_entries').delete()
      .eq('clinic_id', ctx.clinic_id).eq('consultation_id', consultationId)
      .in('label', semValor)
  }

  if (comValor.length) {
    const { error } = await ctx.admin.from('exam_manual_entries').upsert(
      comValor.map(e => ({
        clinic_id: ctx.clinic_id, consultation_id: consultationId,
        item_id: e.item_id || null, label: e.label,
        value_text: String(e.value).trim(), entered_by: ctx.user_id, updated_at: agora,
      })),
      { onConflict: 'consultation_id,label' },
    )
    if (error) return { error: 'Erro ao salvar: ' + mensagemErro(error, 'lib/actions/exam-manual-entries.ts') }
  }

  revalidatePath(`/dashboard/exams/${consultationId}`)
  revalidatePath(`/dashboard/exams/${consultationId}/laudo`)
  return { ok: true, saved: comValor.length }
}
