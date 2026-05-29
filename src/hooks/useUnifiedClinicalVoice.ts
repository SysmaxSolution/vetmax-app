'use client'

import { useCallback, useMemo, useState } from 'react'
import { extractUnifiedClinicalVoice } from '@/lib/actions/ai_extraction'
import {
  mergeExtractions, summarizeExtraction, EMPTY_EXTRACTION,
  type UnifiedVoiceExtraction, type VoiceContext,
} from '@/lib/voice/unified-extraction'

/**
 * Draft acumulado da voz clínica unificada (multi-domínio).
 *
 * NÃO possui motor de voz próprio — para evitar conflito de lock com o engine
 * já ativo no modal (useClinicalVoiceAssistant). O host chama `ingest()` no seu
 * onAutoSave; o hook estrutura via IA e ACUMULA no draft (mergeExtractions):
 * múltiplas gravações somam, campo vazio recebe o novo valor, campo preenchido
 * é mantido, listas concatenam — nunca apaga o que já foi ditado. O draft é
 * revisado/editado antes de persistir.
 */

export function hasAnyExtraction(d: UnifiedVoiceExtraction): boolean {
  return !!(d.vitals || d.clinical_data || d.checklist || d.fluids.length || d.tasks.length || d.medications.length || d.notes.trim())
}

export function useUnifiedVoiceDraft(context: VoiceContext) {
  const [draft, setDraft]               = useState<UnifiedVoiceExtraction>(EMPTY_EXTRACTION)
  const [summary, setSummary]           = useState<{ label: string; count: number }[] | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError]               = useState<string | null>(null)

  /**
   * Estrutura um trecho ditado e ACUMULA no draft. Retorna a extração desta
   * gravação (para o host preencher campos fora das abas, ex.: evolução), ou
   * null em falha.
   */
  const ingest = useCallback(async (transcript: string): Promise<UnifiedVoiceExtraction | null> => {
    if (!transcript.trim()) return null
    setIsProcessing(true); setError(null)
    const res = await extractUnifiedClinicalVoice(transcript.trim(), context)
    setIsProcessing(false)
    if ('error' in res) { setError(res.error); return null }
    setDraft(prev => mergeExtractions(prev, res))
    setSummary(summarizeExtraction(res))
    return res
  }, [context])

  const clear = useCallback(() => {
    setDraft(EMPTY_EXTRACTION); setSummary(null); setError(null)
  }, [])

  const hasDraft = useMemo(() => hasAnyExtraction(draft), [draft])

  return { draft, setDraft, summary, isProcessing, error, hasDraft, ingest, clear }
}
