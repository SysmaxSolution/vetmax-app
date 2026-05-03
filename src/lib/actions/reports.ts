'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrescriptionMed = { name: string; dose: string; route: string; notes: string }

export type PrescriptionData = {
  hospitalization_id: string
  clinic_name:        string
  vet_name:           string
  vet_crmv:           string | null
  patient: {
    name:      string
    species:   string
    breed:     string | null
    weight_kg: number | null
  }
  tutor: {
    name:  string
    phone: string | null
  }
  medications:    PrescriptionMed[]
  suggested_text: string
  issued_at:      string
}

export type DischargeSummaryRecord = {
  created_at:        string
  user_name:         string
  improvement_level: 'piorou' | 'estavel' | 'melhorou'
  notes:             string
  medications:       { name: string; dose: string; route: string; notes: string }[]
}

export type DischargeSummaryLog = {
  created_at:  string
  user_name:   string
  from_status: string
  to_status:   string
}

export type DischargeSummary = {
  hospitalization_id: string
  reason:             string | null
  notes:              string | null
  admitted_at:        string
  discharged_at:      string | null
  patient:            { name: string; species: string; breed: string | null; photo_url: string | null }
  tutor:              { name: string; phone: string | null }
  clinic_name:        string
  records:            DischargeSummaryRecord[]
  logs:               DischargeSummaryLog[]
}

// ─── Server Action ────────────────────────────────────────────────────────────

export async function generateDischargeSummary(
  hospitalizationId: string
): Promise<DischargeSummary | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  // 1. Internação + paciente + tutor
  const { data: hosp, error: hospErr } = await admin
    .from('hospitalizations')
    .select(`
      id, reason, notes, created_at, discharged_at,
      patients ( name, species, breed, photo_url, tutors ( name, phone ) )
    `)
    .eq('id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (hospErr || !hosp) return { error: 'Internação não encontrada.' }

  // 2. Evoluções clínicas (ordem cronológica)
  const { data: records } = await admin
    .from('hospitalization_records')
    .select('created_at, user_name, improvement_level, notes, medications')
    .eq('hospitalization_id', hospitalizationId)
    .order('created_at', { ascending: true })

  // 3. Logs de movimentação
  const { data: logs } = await admin
    .from('hospitalization_logs')
    .select('created_at, user_name, from_status, to_status')
    .eq('hospitalization_id', hospitalizationId)
    .order('created_at', { ascending: true })

  // 4. Nome da clínica
  const { data: clinic } = await admin
    .from('clinics')
    .select('name')
    .eq('id', profile.clinic_id)
    .single()

  const pat   = hosp.patients as any
  const tutor = pat?.tutors   as any

  return {
    hospitalization_id: hosp.id,
    reason:             hosp.reason      ?? null,
    notes:              hosp.notes       ?? null,
    admitted_at:        hosp.created_at,
    discharged_at:      hosp.discharged_at ?? null,
    patient: {
      name:      pat?.name      ?? '—',
      species:   pat?.species   ?? '',
      breed:     pat?.breed     ?? null,
      photo_url: pat?.photo_url ?? null,
    },
    tutor: {
      name:  tutor?.name  ?? '—',
      phone: tutor?.phone ?? null,
    },
    clinic_name: clinic?.name ?? 'VetMax',
    records: (records ?? []).map((r: any) => ({
      created_at:        r.created_at,
      user_name:         r.user_name,
      improvement_level: r.improvement_level as 'piorou' | 'estavel' | 'melhorou',
      notes:             r.notes ?? '',
      medications:       Array.isArray(r.medications) ? r.medications : [],
    })),
    logs: (logs ?? []).map((l: any) => ({
      created_at:  l.created_at,
      user_name:   l.user_name,
      from_status: l.from_status,
      to_status:   l.to_status,
    })),
  }
}

// ─── Receituário Veterinário ──────────────────────────────────────────────────

export async function generatePrescriptionPdf(
  hospitalizationId: string,
  aiSuggestedText:   string,
  aiMedications:     PrescriptionMed[]
): Promise<PrescriptionData | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, full_name, crmv')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  const { data: hosp, error: hospErr } = await admin
    .from('hospitalizations')
    .select(`
      id, reason,
      patients ( name, species, breed, weight_kg, tutors ( name, phone ) )
    `)
    .eq('id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (hospErr || !hosp) return { error: 'Internação não encontrada.' }

  const { data: clinic } = await admin
    .from('clinics')
    .select('name')
    .eq('id', profile.clinic_id)
    .single()

  const pat   = hosp.patients as any
  const tutor = pat?.tutors   as any

  // Constrói texto sugerido base a partir dos dados da IA
  const medBlock = aiMedications
    .map((m, i) =>
      `${i + 1}. **${m.name}** — ${m.dose} (${m.route})` +
      (m.notes ? `\n   *${m.notes}*` : '')
    )
    .join('\n')

  const suggested_text = [
    aiSuggestedText?.trim(),
    medBlock ? `\n**Medicações Prescritas:**\n${medBlock}` : '',
  ].filter(Boolean).join('\n\n')

  return {
    hospitalization_id: hosp.id,
    clinic_name:        clinic?.name    ?? 'VetMax',
    vet_name:           profile.full_name,
    vet_crmv:           (profile as any).crmv ?? null,
    patient: {
      name:      pat?.name       ?? '—',
      species:   pat?.species    ?? '',
      breed:     pat?.breed      ?? null,
      weight_kg: pat?.weight_kg  ?? null,
    },
    tutor: {
      name:  tutor?.name  ?? '—',
      phone: tutor?.phone ?? null,
    },
    medications:    aiMedications,
    suggested_text,
    issued_at: new Date().toISOString(),
  }
}
