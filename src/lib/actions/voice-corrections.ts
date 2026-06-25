'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyCorrections, type CorrectionRule } from '@/lib/voice/correction-dictionary'
import { mineCorrections } from '@/lib/voice/correction-mining'

// Nº de observações da mesma correção antes de ela passar a ser aplicada
// automaticamente (suggested → active). Trava anti-veneno do dicionário local.
const PROMOTE_AT = 3

export type ClinicCorrection = {
  id: string
  wrong_term: string
  right_term: string
  hits: number
  status: 'active' | 'suggested' | 'rejected'
  source: 'manual' | 'learned' | 'global'
  created_at: string
}

// Resolve a clínica do usuário autenticado (NULL se não autenticado/sem clínica).
async function resolveClinicId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  return profile?.clinic_id ?? null
}

// Lista o dicionário da própria clínica (não inclui as regras globais).
export async function listClinicCorrections(): Promise<ClinicCorrection[]> {
  const clinicId = await resolveClinicId()
  if (!clinicId) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('voice_correction_terms')
    .select('id, wrong_term, right_term, hits, status, source, created_at')
    .eq('clinic_id', clinicId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as ClinicCorrection[]
}

// Aprova (active) ou rejeita (rejected) uma regra do dicionário da clínica.
export async function setCorrectionStatus(
  id: string,
  status: 'active' | 'rejected'
): Promise<{ success: true } | { error: string }> {
  const clinicId = await resolveClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('voice_correction_terms')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('clinic_id', clinicId)
  return error ? { error: error.message } : { success: true }
}

// Edita os termos de uma regra (e a reativa).
export async function updateCorrectionTerms(
  id: string,
  wrongTerm: string,
  rightTerm: string
): Promise<{ success: true } | { error: string }> {
  if (!wrongTerm.trim() || !rightTerm.trim()) return { error: 'Termos não podem ser vazios.' }
  const clinicId = await resolveClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('voice_correction_terms')
    .update({
      wrong_term: wrongTerm.trim().toLowerCase(),
      right_term: rightTerm.trim(),
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('clinic_id', clinicId)
  return error ? { error: error.message } : { success: true }
}

// Adiciona uma regra manual (já ativa).
export async function addManualCorrection(
  wrongTerm: string,
  rightTerm: string
): Promise<{ success: true } | { error: string }> {
  if (!wrongTerm.trim() || !rightTerm.trim()) return { error: 'Preencha os dois termos.' }
  const clinicId = await resolveClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const wrong = wrongTerm.trim().toLowerCase()

  const { data: existing } = await admin
    .from('voice_correction_terms')
    .select('id')
    .eq('clinic_id', clinicId)
    .ilike('wrong_term', wrong)
    .maybeSingle()

  if (existing) {
    const { error } = await admin
      .from('voice_correction_terms')
      .update({ right_term: rightTerm.trim(), status: 'active', source: 'manual', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return error ? { error: error.message } : { success: true }
  }

  const { error } = await admin
    .from('voice_correction_terms')
    .insert({
      clinic_id: clinicId,
      wrong_term: wrong,
      right_term: rightTerm.trim(),
      hits: PROMOTE_AT,
      status: 'active',
      source: 'manual',
    })
  return error ? { error: error.message } : { success: true }
}

// Remove uma regra do dicionário da clínica.
export async function deleteCorrection(id: string): Promise<{ success: true } | { error: string }> {
  const clinicId = await resolveClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('voice_correction_terms')
    .delete()
    .eq('id', id)
    .eq('clinic_id', clinicId)
  return error ? { error: error.message } : { success: true }
}

// Regras ativas aplicáveis a uma clínica: as próprias + as globais (clinic_id NULL).
export async function getActiveCorrectionsForClinic(clinicId: string): Promise<CorrectionRule[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('voice_correction_terms')
    .select('wrong_term, right_term')
    .eq('status', 'active')
    .or(`clinic_id.eq.${clinicId},clinic_id.is.null`)

  return (data ?? []).map(r => ({ wrong: r.wrong_term as string, right: r.right_term as string }))
}

// Aplica o dicionário de correção a uma transcrição, resolvendo a clínica do
// usuário autenticado. Falha de forma segura: na dúvida, devolve o texto original.
export async function correctTranscript(transcript: string): Promise<string> {
  if (!transcript.trim()) return transcript

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return transcript

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return transcript

  const rules = await getActiveCorrectionsForClinic(profile.clinic_id)
  return applyCorrections(transcript, rules)
}

// Captura o par (transcrição bruta, texto final do MV) e aprende: minera
// candidatos foneticamente próximos e os acumula no dicionário da clínica.
// Falha-seguro e fire-and-forget pelo chamador — nunca bloqueia o atendimento.
export async function recordVoiceCorrectionEvent(
  consultationId: string | null,
  rawTranscript: string,
  finalText: string
): Promise<{ learned: number } | { error: string }> {
  if (!rawTranscript.trim() || !finalText.trim()) return { learned: 0 }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const clinicId = profile.clinic_id

  // 1. Log cru (auditoria + reprocessamento futuro).
  await admin.from('voice_correction_events').insert({
    clinic_id: clinicId,
    consultation_id: consultationId,
    raw_transcript: rawTranscript,
    final_text: finalText,
    processed: true,
  })

  // 2. Minera candidatos foneticamente próximos (descarta reescrita).
  const candidates = mineCorrections(rawTranscript, finalText)
  if (candidates.length === 0) return { learned: 0 }

  // 3. Acumula no dicionário da clínica: hits++ e promove no threshold.
  let learned = 0
  for (const cand of candidates) {
    const wrong = cand.wrong.toLowerCase()
    const { data: existing } = await admin
      .from('voice_correction_terms')
      .select('id, hits, status')
      .eq('clinic_id', clinicId)
      .ilike('wrong_term', wrong)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'rejected') continue // MV já descartou — respeita
      const newHits = existing.hits + 1
      const newStatus = newHits >= PROMOTE_AT ? 'active' : existing.status
      await admin
        .from('voice_correction_terms')
        .update({ hits: newHits, status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      learned++
    } else {
      await admin.from('voice_correction_terms').insert({
        clinic_id: clinicId,
        wrong_term: wrong,
        right_term: cand.right,
        hits: 1,
        status: 'suggested',
        source: 'learned',
      })
      learned++
    }
  }
  return { learned }
}
