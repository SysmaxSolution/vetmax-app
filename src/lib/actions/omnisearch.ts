'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type OmnisearchKind = 'patient' | 'tutor' | 'consultation'

export interface OmnisearchHit {
  kind:     OmnisearchKind
  /** ID destino (patient/tutor/consultation). */
  id:       string
  /** Linha principal da entrada (nome do pet, nome do tutor, ID curto). */
  title:    string
  /** Texto auxiliar (espécie/raça, telefone, paciente da consulta). */
  subtitle: string
  /** Rota para o usuário (Link href). */
  href:     string
}

/**
 * Busca universal sobre Pet / Tutor / ID de Atendimento. Limitada a 5 hits
 * por tipo (15 no total) para caber no command palette. Multi-tenancy via
 * clinic_id no filtro.
 *
 * Para consultations aceita prefixo dos primeiros 8 chars do UUID (formato
 * que aparece nos cards) ou UUID completo.
 */
export async function omnisearch(query: string): Promise<OmnisearchHit[] | { error: string }> {
  const q = (query ?? '').trim()
  if (q.length < 2) return []

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
  const pattern  = `%${q}%`

  // ── Pets ───────────────────────────────────────────────────────────────────
  const petsP = admin
    .from('patients')
    .select('id, name, species, breed, tutors(name)')
    .eq('clinic_id', clinicId)
    .ilike('name', pattern)
    .order('name', { ascending: true })
    .limit(5)

  // ── Tutores ────────────────────────────────────────────────────────────────
  const cpfDigits = q.replace(/\D/g, '')
  const tutorsByName = admin
    .from('tutors')
    .select('id, name, phone, cpf')
    .eq('clinic_id', clinicId)
    .ilike('name', pattern)
    .order('name', { ascending: true })
    .limit(5)

  const tutorsByPhone = cpfDigits.length >= 6
    ? admin
        .from('tutors')
        .select('id, name, phone, cpf')
        .eq('clinic_id', clinicId)
        .or(`phone.ilike.%${cpfDigits}%,cpf.ilike.%${cpfDigits}%`)
        .order('name', { ascending: true })
        .limit(5)
    : Promise.resolve({ data: [] as Array<{ id: string; name: string; phone: string | null; cpf: string | null }> })

  // ── Atendimentos por ID curto (8+ hex chars) ───────────────────────────────
  const looksLikeUuidFrag = /^[a-f0-9-]{8,}$/i.test(q)
  const consultsP = looksLikeUuidFrag
    ? admin
        .from('consultations')
        .select('id, status, patients(name)')
        .eq('clinic_id', clinicId)
        .ilike('id', `${q.toLowerCase()}%`)
        .limit(5)
    : Promise.resolve({ data: [] as Array<{ id: string; status: string; patients: { name: string } | null }> })

  const [petsRes, tutorsByNameRes, tutorsByPhoneRes, consultsRes] = await Promise.all([
    petsP, tutorsByName, tutorsByPhone, consultsP,
  ])

  const hits: OmnisearchHit[] = []

  for (const p of (petsRes.data ?? []) as any[]) {
    hits.push({
      kind:     'patient',
      id:       p.id,
      title:    p.name ?? '(sem nome)',
      subtitle: [p.species, p.breed].filter(Boolean).join(' · ') + (p.tutors?.name ? ` — Tutor: ${p.tutors.name}` : ''),
      href:     `/dashboard/patients/${p.id}`,
    })
  }

  const seenTutors = new Set<string>()
  for (const t of [...((tutorsByNameRes.data ?? []) as any[]), ...((tutorsByPhoneRes.data ?? []) as any[])]) {
    if (seenTutors.has(t.id)) continue
    seenTutors.add(t.id)
    if (hits.filter(h => h.kind === 'tutor').length >= 5) break
    hits.push({
      kind:     'tutor',
      id:       t.id,
      title:    t.name ?? '(sem nome)',
      subtitle: [t.phone, t.cpf].filter(Boolean).join(' · ') || 'Sem telefone/CPF',
      href:     `/dashboard/patients?tutor=${t.id}`,
    })
  }

  for (const c of (consultsRes.data ?? []) as any[]) {
    hits.push({
      kind:     'consultation',
      id:       c.id,
      title:    `Atendimento ${(c.id as string).slice(0, 8)}`,
      subtitle: `${c.patients?.name ?? 'paciente'} — status ${c.status}`,
      href:     `/dashboard/vet/${c.id}`,
    })
  }

  return hits
}
