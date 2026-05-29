'use server'

import { recordClinicalVital } from './vitals'
import { recordFluid } from './hospitalization-fluids'
import { updateHospitalizationClinicalData } from './hospitalizations'
import { createHospitalizationTask } from './hospitalization-tasks'
import { createHospitalizationPrescription } from './hospitalization-prescriptions'
import { recordSurgeryVital, updateSurgeryChecklist, updateSurgeryReport, getSurgery } from './surgeries'
import type { UnifiedVoiceExtraction, VoiceContext } from '@/lib/voice/unified-extraction'

/**
 * Persiste o draft revisado da voz unificada em cada aba, reusando as actions
 * existentes (cada uma escopa clinic_id por conta própria).
 *
 * Idempotência: vitais/fluidos/tarefas/medicações são tabelas append-only —
 * a UI limpa o draft após sucesso e desabilita o botão durante a gravação,
 * evitando duplicação por duplo-clique. Dados Clínicos/Checklist são updates
 * (não duplicam por natureza).
 */

export interface PersistVoiceResult {
  vitals:        number
  fluids:        number
  tasks:         number
  medications:   number
  clinical_data: boolean
  checklist:     boolean
  report:        boolean
  errors:        string[]
}

export async function persistUnifiedVoiceDraft(params: {
  context:            VoiceContext
  hospitalizationId?: string
  surgeryId?:         string
  draft:              UnifiedVoiceExtraction
}): Promise<PersistVoiceResult | { error: string }> {
  const { context, hospitalizationId, surgeryId, draft } = params
  const out: PersistVoiceResult = {
    vitals: 0, fluids: 0, tasks: 0, medications: 0, clinical_data: false, checklist: false, report: false, errors: [],
  }

  // ─── Cirurgia ──────────────────────────────────────────────────────────────
  if (context === 'surgery') {
    if (!surgeryId) return { error: 'surgeryId é obrigatório no contexto cirúrgico.' }

    if (draft.vitals) {
      const v = draft.vitals
      const res = await recordSurgeryVital(surgeryId, {
        temperature: v.temperature, heart_rate: v.heart_rate, resp_rate: v.resp_rate,
        spo2: v.spo2, blood_pressure: v.blood_pressure,
      })
      if ('error' in res) out.errors.push(`Vitais: ${res.error}`); else out.vitals = 1
    }

    // Checklist + relatório precisam mesclar com o estado atual (não sobrescrever).
    if (draft.checklist || draft.notes.trim()) {
      const cur = await getSurgery(surgeryId)
      if ('error' in cur) { out.errors.push(`Ficha: ${cur.error}`); return out }

      if (draft.checklist) {
        const c = draft.checklist
        const merged = {
          ...cur.checklist,
          ...(c.fasting_confirmed !== null ? { fasting_confirmed: c.fasting_confirmed } : {}),
          ...(c.preop_exams_ok    !== null ? { preop_exams_ok:    c.preop_exams_ok }    : {}),
          ...(c.consent_signed    !== null ? { consent_signed:    c.consent_signed }    : {}),
        }
        const res = await updateSurgeryChecklist(surgeryId, merged)
        if ('error' in res) out.errors.push(`Checklist: ${res.error}`); else out.checklist = true
      }

      if (draft.notes.trim()) {
        const merged = [cur.surgical_report ?? '', draft.notes.trim()].filter(Boolean).join('\n').trim()
        const res = await updateSurgeryReport(surgeryId, merged)
        if ('error' in res) out.errors.push(`Relatório: ${res.error}`); else out.report = true
      }
    }
    return out
  }

  // ─── Internação Completa ─────────────────────────────────────────────────────
  if (!hospitalizationId) return { error: 'hospitalizationId é obrigatório no contexto de internação.' }

  if (draft.vitals) {
    const v = draft.vitals
    const res = await recordClinicalVital({
      hospitalization_id: hospitalizationId, source: 'voice',
      temperature: v.temperature, heart_rate: v.heart_rate, resp_rate: v.resp_rate, weight: v.weight,
      blood_pressure: v.blood_pressure, glucose: v.glucose, spo2: v.spo2, mucosa: v.mucosa,
      tpc_seconds: v.tpc_seconds, hydration_pct: v.hydration_pct, pain_score: v.pain_score,
    })
    if ('error' in res) out.errors.push(`Vitais: ${res.error}`); else out.vitals = 1
  }

  for (const f of draft.fluids) {
    const res = await recordFluid({ hospitalization_id: hospitalizationId, direction: f.direction, kind: f.kind, volume_ml: f.volume_ml, notes: f.notes })
    if ('error' in res) out.errors.push(`Fluido: ${res.error}`); else out.fluids++
  }

  if (draft.clinical_data) {
    const c = draft.clinical_data
    const fields: Parameters<typeof updateHospitalizationClinicalData>[1] = {}
    if (c.diet_notes !== null)          fields.diet_notes = c.diet_notes
    if (c.estimated_discharge !== null) fields.estimated_discharge = c.estimated_discharge
    if (c.fasting !== null)             fields.fasting = c.fasting
    if (c.isolation_required !== null)  fields.isolation_required = c.isolation_required
    if (Object.keys(fields).length > 0) {
      const res = await updateHospitalizationClinicalData(hospitalizationId, fields)
      if ('error' in res) out.errors.push(`Dados Clínicos: ${res.error}`); else out.clinical_data = true
    }
  }

  for (const t of draft.tasks) {
    const res = await createHospitalizationTask({ hospitalization_id: hospitalizationId, kind: t.kind, description: t.description, frequency_hours: t.frequency_hours })
    if ('error' in res) out.errors.push(`Tarefa: ${res.error}`); else out.tasks++
  }

  for (const m of draft.medications) {
    const res = await createHospitalizationPrescription({
      hospitalization_id: hospitalizationId, medication_name: m.name,
      dose: m.dose, route: m.route, frequency_hours: m.frequency_hours, duration_hours: m.duration_hours, notes: m.notes,
    })
    if ('error' in res) out.errors.push(`Medicação ${m.name}: ${res.error}`); else out.medications++
  }

  return out
}
