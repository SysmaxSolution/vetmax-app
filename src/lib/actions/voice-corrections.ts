'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyCorrections, type CorrectionRule } from '@/lib/voice/correction-dictionary'

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
