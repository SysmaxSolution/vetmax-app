// Persistência das curvas (OBX tipo ED) do analisador.
// Separado das server actions de propósito: é reusado pela rota /api/lab/results
// (agente do laboratório) e pelo import manual de HL7 no ExamResultsPanel.
//
// Desde a 0487 o PNG vai BINÁRIO para o bucket privado `exam-graphs` e a tabela
// guarda só o caminho + metadados. Ver o cabeçalho da migration para o porquê.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { HL7Graph } from './hl7-parser'
import { graphTitle } from './hemogram-report'
import { GRAPH_BUCKET, decodeGraphPayload, graphObjectPath } from './graph-storage'

interface GraphRow {
  clinic_id: string
  consultation_id: string
  code: string
  title: string
  mime: string | null
  encoding: string
  data: string | null
  storage_path: string | null
  bytes: number | null
  width: number | null
  height: number | null
  source: string
}

/**
 * Grava/atualiza as curvas da consulta. Idempotente por (consultation_id, code)
 * no banco e por caminho determinístico no Storage: reimportar o mesmo ORU
 * sobrescreve a imagem em vez de acumular.
 *
 * Best-effort — o gráfico é acessório; nunca derruba o import dos analitos.
 * Se o upload falhar (Storage fora, mime recusado), a curva cai no modo legado
 * (base64 na coluna `data`) para o laudo não ficar sem a imagem.
 */
export async function persistExamGraphs(
  admin: SupabaseClient,
  clinicId: string,
  consultationId: string,
  graphs: HL7Graph[],
): Promise<{ saved: number; uploaded: number; inlined: number; bytes: number; error?: string }> {
  const candidates = (graphs ?? []).filter(g => g.code && g.data)
  if (candidates.length === 0) return { saved: 0, uploaded: 0, inlined: 0, bytes: 0 }

  const rows: GraphRow[] = []
  let uploaded = 0, inlined = 0, bytes = 0

  for (const g of candidates) {
    const code = g.code as string
    const base: GraphRow = {
      clinic_id: clinicId,
      consultation_id: consultationId,
      code,
      title: graphTitle(code),
      mime: g.mime,
      encoding: g.encoding ?? 'Base64',
      data: null,
      storage_path: null,
      bytes: null,
      width: null,
      height: null,
      source: 'hl7',
    }

    const decoded = decodeGraphPayload(g)
    if (!decoded) {
      // Não é imagem reconhecível: guarda o payload cru para não perder o dado.
      rows.push({ ...base, data: g.data })
      inlined++
      continue
    }

    const path = graphObjectPath(clinicId, consultationId, code, decoded.mime)
    const { error: upErr } = await admin.storage.from(GRAPH_BUCKET).upload(path, decoded.bytes, {
      contentType: decoded.mime,
      upsert: true,
      cacheControl: '31536000',   // a curva de uma amostra nunca muda
    })

    if (upErr) {
      rows.push({ ...base, data: g.data, mime: decoded.mime, bytes: decoded.byteLength })
      inlined++
      continue
    }

    rows.push({
      ...base,
      mime: decoded.mime,
      encoding: 'binary',
      storage_path: path,
      bytes: decoded.byteLength,
      width: decoded.width,
      height: decoded.height,
    })
    uploaded++
    bytes += decoded.byteLength
  }

  const { error } = await admin.from('exam_result_graphs')
    .upsert(rows, { onConflict: 'consultation_id,code' })
  if (error) return { saved: 0, uploaded, inlined, bytes, error: error.message }
  return { saved: rows.length, uploaded, inlined, bytes }
}
