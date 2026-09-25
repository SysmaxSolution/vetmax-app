// Persistência das curvas (OBX tipo ED) do analisador em exam_result_graphs.
// Separado das server actions de propósito: é reusado pela rota /api/lab/results
// (agente do laboratório) e pelo import manual de HL7 no ExamResultsPanel.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { HL7Graph } from './hl7-parser'
import { graphTitle } from './hemogram-report'

/**
 * Grava/atualiza as curvas da consulta. Idempotente por (consultation_id, code):
 * reimportar o mesmo ORU substitui a imagem em vez de acumular.
 * Best-effort — o gráfico é acessório; nunca derruba o import dos analitos.
 */
export async function persistExamGraphs(
  admin: SupabaseClient,
  clinicId: string,
  consultationId: string,
  graphs: HL7Graph[],
): Promise<{ saved: number; error?: string }> {
  const rows = (graphs ?? [])
    .filter(g => g.code && g.data)
    .map(g => ({
      clinic_id: clinicId,
      consultation_id: consultationId,
      code: g.code as string,
      title: graphTitle(g.code),
      mime: g.mime,
      encoding: g.encoding ?? 'Base64',
      data: g.data,
      source: 'hl7',
    }))
  if (rows.length === 0) return { saved: 0 }

  const { error } = await admin.from('exam_result_graphs')
    .upsert(rows, { onConflict: 'consultation_id,code' })
  if (error) return { saved: 0, error: error.message }
  return { saved: rows.length }
}
