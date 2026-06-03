'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchStatus =
  | 'pending'
  | 'matched'
  | 'partial'
  | 'orphan_invoice'
  | 'missing_patient_profile'
  | 'duplicated'
  | 'manual_resolved'
  | 'ignored'

export interface RemittanceLineRow {
  id:                      string
  external_appointment_id: string
  service_date:            string
  tutor_name_raw:          string | null
  pet_name_raw:            string | null
  species_raw:             string | null
  breed_raw:               string | null
  plan_name_raw:           string | null
  microchip_raw:           string | null
  procedure_name_raw:      string | null
  repass_value:            number
  coparticipation_value:   number
  match_status:            MatchStatus
  match_confidence:        number | null
  matched_invoice_item_id: string | null
  matched_patient_id:      string | null
  matched_tutor_id:        string | null
  match_notes:             unknown
}

export interface ReviewBundle {
  remittance: {
    id:                   string
    remittance_number:    string
    period_start:         string
    period_end:           string
    status:               string
    total_gross_value:    number
    referral_bonus_value: number
    lines_total:          number
    is_preview:           boolean
    source_format:        'closed' | 'open'
  }
  matched:                RemittanceLineRow[]
  partial:                RemittanceLineRow[]
  orphan_invoice:         RemittanceLineRow[]
  missing_patient_profile: RemittanceLineRow[]
  counts: {
    matched:                  number
    partial:                  number
    orphan_invoice:           number
    missing_patient_profile:  number
    matched_value:            number
    partial_value:            number
    orphan_invoice_value:     number
    missing_patient_value:    number
    /** Pets distintos já cadastrados no sistema e reconhecidos na remessa. */
    unique_pets_known:        number
    /** Pets distintos da remessa que ainda NÃO existem no sistema (agrupados por chip || nome+tutor). */
    unique_pets_to_register:  number
    /** Total de pets distintos identificados na remessa (known + to_register). */
    unique_pets_total:        number
  }
}

export interface BulkCreateResult {
  created_patients:    number
  created_tutors:      number
  created_pet_insurance: number
  reused_tutors:       number
  errors:              string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
//
// IMPORTANTE: usamos o admin client em writes para evitar surpresas com a
// função SQL get_user_clinic_id() em cenários onde profiles.clinic_id pode
// estar desatualizado (multi-clinic switcher, sessões antigas). A segurança
// é garantida validando manualmente clinic_id no início de cada action.

type ClinicCtx = {
  supabase: ReturnType<typeof createAdminClient>
  clinicId: string
  userId:   string
}

async function getCtx(): Promise<ClinicCtx | { error: string }> {
  const supabaseSSR = await createClient()
  const { data: { user } } = await supabaseSSR.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }
  return { supabase: admin, clinicId: profile.clinic_id, userId: user.id }
}

function normalizeChip(s: string | null | undefined): string {
  return (s ?? '').replace(/^#/, '').replace(/\D/g, '').trim()
}

function normalizeName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase()
}

function mapSpecies(raw: string | null | undefined): 'dog' | 'cat' | 'bird' | 'rabbit' | 'rodent' | 'reptile' | 'fish' | 'exotic' {
  const s = normalizeName(raw)
  if (/cachorro|cao|canino/.test(s)) return 'dog'
  if (/gato|felino/.test(s))         return 'cat'
  if (/passaro|ave/.test(s))         return 'bird'
  if (/coelho/.test(s))              return 'rabbit'
  if (/hamster|porquinho|rato/.test(s)) return 'rodent'
  if (/reptil|tartaruga|cobra|iguana/.test(s)) return 'reptile'
  if (/peixe/.test(s))               return 'fish'
  return 'exotic'
}

function findInvoiceItemByName(items: { id: string; description: string; expected_value: number | null; total_price: number }[], procName: string, repass: number) {
  if (items.length === 0) return null
  const targetName = normalizeName(procName)
  // Match exato por nome normalizado
  const exact = items.find(it => normalizeName(it.description) === targetName)
  if (exact) return exact
  // Match parcial (contém todos os tokens significativos)
  const tokens = targetName.split(' ').filter(t => t.length > 3)
  if (tokens.length === 0) return null
  const partial = items.find(it => {
    const desc = normalizeName(it.description)
    return tokens.every(t => desc.includes(t))
  })
  return partial ?? null
}

function valueWithinTolerance(expected: number | null, actual: number, ratio = 0.15): boolean {
  if (!expected || expected <= 0) return actual <= 0 || actual < 5
  const delta = Math.abs(expected - actual) / expected
  return delta <= ratio
}

// ─── runMatchEngine ───────────────────────────────────────────────────────────

export async function runMatchEngine(remittanceId: string): Promise<{ updated: number; matched: number; partial: number; orphan: number; missing: number; errors: string[] } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data: lines, error: linesErr } = await supabase
    .from('petlove_remittance_lines')
    .select('id, external_appointment_id, service_date, tutor_name_raw, pet_name_raw, microchip_raw, procedure_name_raw, repass_value, match_status')
    .eq('clinic_id', clinicId)
    .eq('remittance_id', remittanceId)

  if (linesErr) return { error: linesErr.message }
  if (!lines || lines.length === 0) return { updated: 0, matched: 0, partial: 0, orphan: 0, missing: 0, errors: [] }

  // ─── Carregar lookup tables em memória (uma vez por execução) ───────────────
  const allChips = Array.from(new Set(lines.map(l => normalizeChip(l.microchip_raw)).filter(Boolean)))
  const allNames = Array.from(new Set(lines.map(l => normalizeName(l.pet_name_raw)).filter(Boolean)))

  // Pets por microchip — usa .in() em batches para evitar query URL muito longa
  const petsByChip = new Map<string, { id: string; name: string; tutor_id: string | null }>()
  if (allChips.length > 0) {
    const chipsWithHash = allChips.flatMap(c => [c, `#${c}`])
    const BATCH = 200
    for (let i = 0; i < chipsWithHash.length; i += BATCH) {
      const batch = chipsWithHash.slice(i, i + BATCH)
      const { data: petsM } = await supabase
        .from('patients')
        .select('id, name, tutor_id, microchip_id, microchip')
        .eq('clinic_id', clinicId)
        .or(`microchip_id.in.(${batch.map(c => `"${c}"`).join(',')}),microchip.in.(${batch.map(c => `"${c}"`).join(',')})`)
      for (const p of petsM ?? []) {
        const chip = normalizeChip(p.microchip_id ?? p.microchip)
        if (chip) petsByChip.set(chip, { id: p.id, name: p.name, tutor_id: p.tutor_id })
      }
    }
  }

  // Pets por nome (fallback quando chip não bate)
  const petsByName = new Map<string, { id: string; name: string; tutor_id: string | null }[]>()
  if (allNames.length > 0) {
    const { data: petsN } = await supabase
      .from('patients')
      .select('id, name, tutor_id')
      .eq('clinic_id', clinicId)
    for (const p of petsN ?? []) {
      const key = normalizeName(p.name)
      const list = petsByName.get(key) ?? []
      list.push({ id: p.id, name: p.name, tutor_id: p.tutor_id })
      petsByName.set(key, list)
    }
  }

  // tutor_id → nome (para desambiguar pets de mesmo nome por tutor).
  // Necessário porque o chip da planilha pode não bater quando o pet já
  // existe no banco SEM chip cadastrado — neste caso confiamos no par
  // (pet_name + tutor_name) e depois preenchemos o chip do cadastro.
  const candidateTutorIds = new Set<string>()
  for (const list of petsByName.values()) for (const p of list) if (p.tutor_id) candidateTutorIds.add(p.tutor_id)
  for (const p of petsByChip.values()) if (p.tutor_id) candidateTutorIds.add(p.tutor_id)
  const tutorNameById = new Map<string, string>()
  if (candidateTutorIds.size > 0) {
    const ids = Array.from(candidateTutorIds)
    const BATCH = 200
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      const { data: tutors } = await supabase
        .from('tutors')
        .select('id, name')
        .eq('clinic_id', clinicId)
        .in('id', batch)
      for (const t of tutors ?? []) tutorNameById.set(t.id, t.name)
    }
  }

  let updates = 0
  const counters = { matched: 0, partial: 0, orphan: 0, missing: 0 }
  const errors: string[] = []
  const matchedItemIds = new Set<string>()

  async function applyUpdate(lineId: string, patch: Record<string, unknown>, kind: 'matched' | 'partial' | 'orphan' | 'missing') {
    const { error } = await supabase
      .from('petlove_remittance_lines')
      .update(patch)
      .eq('id', lineId)
      .eq('clinic_id', clinicId) // double-check (defesa contra ambiguidade)
    if (error) {
      errors.push(`linha ${lineId}: ${error.message}`)
      return
    }
    counters[kind]++
    updates++
  }

  for (const line of lines) {
    const chip = normalizeChip(line.microchip_raw)
    const nameKey = normalizeName(line.pet_name_raw)
    const tutorKey = normalizeName(line.tutor_name_raw)

    let patient = chip ? petsByChip.get(chip) ?? null : null
    let confidence = 0
    let note: Record<string, unknown> = {}
    let chipNeedsFillIn = false

    // 1) Match por (nome do pet + nome do tutor) — cobre o caso em que o
    //    cadastro existe SEM microchip e a planilha traz o chip. Antes desta
    //    blindagem, esse caso virava missing_patient_profile → o bulk register
    //    criava um pet duplicado.
    if (!patient && nameKey && tutorKey) {
      const candidates = petsByName.get(nameKey) ?? []
      const tutorMatched = candidates.filter(c => {
        const tname = c.tutor_id ? normalizeName(tutorNameById.get(c.tutor_id) ?? '') : ''
        return tname && tname === tutorKey
      })
      if (tutorMatched.length === 1) {
        patient = tutorMatched[0]
        confidence = chip ? 75 : 70
        note.fallback = chip ? 'name_tutor_match_chip_missing_in_db' : 'name_tutor_no_chip'
        if (chip) chipNeedsFillIn = true
      } else if (tutorMatched.length > 1) {
        note.ambiguity = `${tutorMatched.length} pets "${line.pet_name_raw}" do tutor "${line.tutor_name_raw}" — resolva manualmente`
      }
    }

    // 2) Fallback por nome único na clínica (sem tutor identificável) — só
    //    se a linha NÃO tem chip. Mantém o comportamento legado para
    //    remessas em aberto sem coluna de tutor preenchida.
    if (!patient && !chip && nameKey) {
      const candidates = petsByName.get(nameKey) ?? []
      if (candidates.length === 1) {
        patient = candidates[0]
        confidence = 55
        note.fallback = 'name_only_no_chip'
      } else if (candidates.length > 1 && !note.ambiguity) {
        note.ambiguity = `${candidates.length} pets com nome "${line.pet_name_raw}" — adicione microchip ao cadastro`
      }
    }

    // 3) Diagnóstico: chip da planilha não bateu e nenhum match secundário
    if (!patient && chip) {
      note.reason_chip = `chip ${chip} não encontrado na clínica`
    }

    // 4) Preenchimento de chip: se casamos por (nome+tutor) e o cadastro
    //    estava sem chip, grava o chip da planilha no patient e atualiza o
    //    cache local para que outras linhas da mesma remessa com o mesmo
    //    chip já batam direto via petsByChip.
    if (patient && chipNeedsFillIn && chip) {
      const { data: cur } = await supabase
        .from('patients')
        .select('microchip_id, microchip')
        .eq('id', patient.id)
        .eq('clinic_id', clinicId)
        .maybeSingle()
      const curChip = (cur?.microchip_id ?? cur?.microchip ?? '').replace(/^#/, '').trim()
      if (!curChip) {
        const { error: chipErr } = await supabase
          .from('patients')
          .update({ microchip_id: chip, microchip: chip })
          .eq('id', patient.id)
          .eq('clinic_id', clinicId)
        if (chipErr) {
          note.chip_fill_error = chipErr.message
        } else {
          note.chip_filled = chip
          petsByChip.set(chip, patient)
        }
      } else if (curChip !== chip) {
        // O cadastro já tem chip diferente. Não sobrescreve — sinaliza
        // discrepância para auditoria manual.
        note.chip_mismatch = { db: curChip, planilha: chip }
      }
    }

    if (!patient) {
      await applyUpdate(line.id, {
        match_status:     'missing_patient_profile',
        match_confidence: 0,
        match_notes:      [{ reason: 'no_patient_match', ...note }],
      }, 'missing')
      continue
    }

    if (confidence === 0) confidence = chip ? 90 : 60

    // ─── Pet encontrado: procurar consultations dia ± 1 ──────────────────────
    const dayBefore = new Date(line.service_date); dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
    const dayAfter  = new Date(line.service_date); dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
    const dateLow  = dayBefore.toISOString().slice(0, 10)
    const dateHigh = dayAfter.toISOString().slice(0, 10)

    const { data: consults } = await supabase
      .from('consultations')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('patient_id', patient.id)
      .gte('created_at', `${dateLow}T00:00:00Z`)
      .lte('created_at', `${dateHigh}T23:59:59Z`)

    if (!consults || consults.length === 0) {
      await applyUpdate(line.id, {
        match_status:       'orphan_invoice',
        match_confidence:   confidence,
        matched_patient_id: patient.id,
        matched_tutor_id:   patient.tutor_id,
        match_notes:        [{ reason: 'no_consultation_in_date_range', date_range: [dateLow, dateHigh] }],
      }, 'orphan')
      continue
    }

    // ─── Consultation(s) encontrada(s): buscar invoice_items aguardando ──────
    const consultIds = consults.map(c => c.id)
    const { data: invItems } = await supabase
      .from('invoice_items')
      .select('id, description, expected_value, total_price, invoices!inner(consultation_id)')
      .in('invoices.consultation_id', consultIds)

    type ItemRow = { id: string; description: string; expected_value: number | null; total_price: number }
    const candidateItems: ItemRow[] = (invItems ?? [])
      .filter((i: { id: string }) => !matchedItemIds.has(i.id))
      .map((i: { id: string; description: string; expected_value: number | null; total_price: number }) => ({
        id: i.id,
        description: i.description,
        expected_value: i.expected_value,
        total_price: i.total_price,
      }))

    const found = findInvoiceItemByName(candidateItems, line.procedure_name_raw ?? '', line.repass_value)

    if (!found) {
      await applyUpdate(line.id, {
        match_status:       'orphan_invoice',
        match_confidence:   confidence,
        matched_patient_id: patient.id,
        matched_tutor_id:   patient.tutor_id,
        match_notes:        [{ reason: 'procedure_not_in_invoice', candidates: candidateItems.length }],
      }, 'orphan')
      continue
    }

    matchedItemIds.add(found.id)
    const inTolerance = valueWithinTolerance(found.expected_value ?? found.total_price, line.repass_value, 0.15)
    const status: MatchStatus = inTolerance ? 'matched' : 'partial'
    const finalConfidence = inTolerance ? Math.min(95, confidence + 5) : Math.max(50, confidence - 10)

    await applyUpdate(line.id, {
      match_status:            status,
      match_confidence:        finalConfidence,
      matched_invoice_item_id: found.id,
      matched_patient_id:      patient.id,
      matched_tutor_id:        patient.tutor_id,
      match_notes: inTolerance
        ? [{ reason: 'exact_or_partial_match' }]
        : [{ reason: 'value_drift', expected: found.expected_value ?? found.total_price, actual: line.repass_value }],
    }, inTolerance ? 'matched' : 'partial')
  }

  // Atualiza status da remessa (não retrocede de reconciled)
  await supabase
    .from('petlove_remittances')
    .update({ status: 'reviewed' })
    .eq('id', remittanceId)
    .in('status', ['imported', 'reviewed'])

  revalidatePath(`/dashboard/financial/insurance-reconciliation/${remittanceId}/review`)
  return { updated: updates, ...counters, errors }
}

// ─── getReviewBundle ──────────────────────────────────────────────────────────

export async function getReviewBundle(remittanceId: string): Promise<ReviewBundle | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data: remittance, error: remErr } = await supabase
    .from('petlove_remittances')
    .select('id, remittance_number, period_start, period_end, status, is_preview, source_format, total_gross_value, referral_bonus_value')
    .eq('clinic_id', clinicId)
    .eq('id', remittanceId)
    .single()
  if (remErr || !remittance) return { error: 'Remessa não encontrada.' }

  const { data: lines, error: linesErr } = await supabase
    .from('petlove_remittance_lines')
    .select('id, external_appointment_id, service_date, tutor_name_raw, pet_name_raw, species_raw, breed_raw, plan_name_raw, microchip_raw, procedure_name_raw, repass_value, coparticipation_value, match_status, match_confidence, matched_invoice_item_id, matched_patient_id, matched_tutor_id, match_notes')
    .eq('clinic_id', clinicId)
    .eq('remittance_id', remittanceId)
    .order('service_date')
  if (linesErr) return { error: linesErr.message }

  const all = (lines ?? []) as RemittanceLineRow[]
  const matched = all.filter(l => l.match_status === 'matched')
  const partial = all.filter(l => l.match_status === 'partial')
  const orphan_invoice = all.filter(l => l.match_status === 'orphan_invoice')
  const missing_patient_profile = all.filter(l => l.match_status === 'missing_patient_profile')

  const sumVal = (arr: RemittanceLineRow[]) => arr.reduce((acc, l) => acc + Number(l.repass_value), 0)

  // ─── Pets únicos da remessa (independe do matching ter sido executado) ────
  // Agrupa pelo mesmo critério do bulk register: chip || nome+tutor
  type PetKey = { key: string; chip: string; petName: string; tutorName: string }
  const remittancePets = new Map<string, PetKey>()
  for (const l of all) {
    const chip      = (l.microchip_raw ?? '').replace(/^#/, '').trim()
    const petName   = (l.pet_name_raw ?? '').trim()
    const tutorName = (l.tutor_name_raw ?? '').trim()
    const key = chip || (petName ? `${normalizeName(petName)}|${normalizeName(tutorName)}` : '')
    if (!key) continue
    if (!remittancePets.has(key)) {
      remittancePets.set(key, { key, chip, petName, tutorName })
    }
  }

  // ─── Lookup direto em patients para descobrir o que JÁ existe no banco ────
  const chips = Array.from(remittancePets.values()).map(p => p.chip).filter(Boolean)
  const petNames = Array.from(remittancePets.values()).filter(p => !p.chip && p.petName).map(p => p.petName)

  const knownByChip = new Set<string>()
  const knownByName = new Set<string>() // lowercase normalized name

  if (chips.length > 0) {
    // Variantes com e sem #
    const chipFilter = chips.flatMap(c => [c, `#${c}`])
    const { data: byChip } = await supabase
      .from('patients')
      .select('microchip_id, microchip')
      .eq('clinic_id', clinicId)
      .or(`microchip_id.in.(${chipFilter.map(c => `"${c}"`).join(',')}),microchip.in.(${chipFilter.map(c => `"${c}"`).join(',')})`)
    for (const p of byChip ?? []) {
      const c1 = (p.microchip_id ?? '').replace(/^#/, '').trim()
      const c2 = (p.microchip    ?? '').replace(/^#/, '').trim()
      if (c1) knownByChip.add(c1)
      if (c2) knownByChip.add(c2)
    }
  }

  if (petNames.length > 0) {
    const { data: byName } = await supabase
      .from('patients')
      .select('name')
      .eq('clinic_id', clinicId)
      .in('name', petNames)
    for (const p of byName ?? []) {
      knownByName.add(normalizeName(p.name))
    }
  }

  let knownCount = 0
  let toRegisterCount = 0
  for (const pet of remittancePets.values()) {
    const exists = pet.chip
      ? knownByChip.has(pet.chip)
      : knownByName.has(normalizeName(pet.petName))
    if (exists) knownCount++
    else        toRegisterCount++
  }

  return {
    remittance: {
      id:                   remittance.id,
      remittance_number:    remittance.remittance_number,
      period_start:         remittance.period_start,
      period_end:           remittance.period_end,
      status:               remittance.status,
      total_gross_value:    Number(remittance.total_gross_value),
      referral_bonus_value: Number(remittance.referral_bonus_value),
      lines_total:          all.length,
      is_preview:           Boolean((remittance as { is_preview?: boolean }).is_preview),
      source_format:        ((remittance as { source_format?: 'closed' | 'open' }).source_format) ?? 'closed',
    },
    matched,
    partial,
    orphan_invoice,
    missing_patient_profile,
    counts: {
      matched:                 matched.length,
      partial:                 partial.length,
      orphan_invoice:          orphan_invoice.length,
      missing_patient_profile: missing_patient_profile.length,
      matched_value:           sumVal(matched),
      partial_value:           sumVal(partial),
      orphan_invoice_value:    sumVal(orphan_invoice),
      missing_patient_value:   sumVal(missing_patient_profile),
      unique_pets_known:       knownCount,
      unique_pets_to_register: toRegisterCount,
      unique_pets_total:       remittancePets.size,
    },
  }
}

// ─── bulkCreatePatientsFromPetlove ────────────────────────────────────────────

export async function bulkCreatePatientsFromPetlove(
  lineIds: string[],
): Promise<BulkCreateResult | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId, userId } = ctx

  if (lineIds.length === 0) return { error: 'Nenhuma linha selecionada.' }

  // Carrega linhas a processar
  const { data: lines, error: linesErr } = await supabase
    .from('petlove_remittance_lines')
    .select('id, remittance_id, tutor_name_raw, pet_name_raw, species_raw, breed_raw, microchip_raw, plan_name_raw, membership_id_raw, match_status')
    .in('id', lineIds)
    .eq('clinic_id', clinicId)
  if (linesErr) return { error: linesErr.message }
  if (!lines || lines.length === 0) return { error: 'Nenhuma linha encontrada para os IDs informados.' }

  // Garante existência do provider Petlove
  const { data: provider } = await supabase
    .from('insurance_providers')
    .select('id')
    .eq('clinic_id', clinicId)
    .ilike('name', 'petlove')
    .maybeSingle()
  if (!provider?.id) return { error: 'Convênio Petlove ainda não está cadastrado para esta clínica.' }
  const providerId = provider.id

  const result: BulkCreateResult = {
    created_patients: 0, created_tutors: 0, created_pet_insurance: 0, reused_tutors: 0, errors: [],
  }

  // Agrupa pets únicos por (microchip || pet_name_raw + tutor_name_raw)
  type LineKey = string
  const seenKeys = new Set<LineKey>()
  const tutorCache = new Map<string, string>() // tutor_name_normalized → tutor_id

  for (const line of lines) {
    try {
      const chip = normalizeChip(line.microchip_raw)
      const petName = (line.pet_name_raw ?? '').trim()
      const tutorName = (line.tutor_name_raw ?? '').trim()
      const dedupeKey: LineKey = chip || `${normalizeName(petName)}|${normalizeName(tutorName)}`

      if (seenKeys.has(dedupeKey)) {
        // Já criado nesta execução — apenas marca a linha como resolvida
        await supabase.from('petlove_remittance_lines').update({
          match_status: 'manual_resolved',
          resolution_action: 'patient_created_bulk',
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        }).eq('id', line.id)
        continue
      }
      seenKeys.add(dedupeKey)

      // ─── Resolve tutor (find-or-create) ────────────────────────────────────
      const tutorKey = normalizeName(tutorName || `petlove-${chip || line.id}`)
      let tutorId = tutorCache.get(tutorKey)

      if (!tutorId) {
        // 1. Tenta achar tutor existente por nome (case-insensitive)
        if (tutorName) {
          const { data: existingTutor } = await supabase
            .from('tutors')
            .select('id')
            .eq('clinic_id', clinicId)
            .ilike('name', tutorName)
            .limit(1)
            .maybeSingle()
          if (existingTutor?.id) {
            tutorId = existingTutor.id
            tutorCache.set(tutorKey, existingTutor.id)
            result.reused_tutors++
          }
        }

        // 2. Cria novo tutor com placeholders
        if (!tutorId) {
          const placeholderCpf   = `PL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase()
          const placeholderPhone = '(não informado)'
          const placeholderName  = tutorName || `Tutor Petlove (chip ${chip || 's/n'})`

          const { data: newTutor, error: tErr } = await supabase
            .from('tutors')
            .insert({
              clinic_id:    clinicId,
              name:         placeholderName,
              cpf:          placeholderCpf,
              phone:        placeholderPhone,
              email:        null,
              created_from: 'petlove_import',
            })
            .select('id')
            .single()
          if (tErr || !newTutor) {
            result.errors.push(`Linha ${line.id}: ${tErr?.message ?? 'falha ao criar tutor'}`)
            continue
          }
          tutorId = newTutor.id
          tutorCache.set(tutorKey, newTutor.id)
          result.created_tutors++
        }
      }

      // ─── Cria patient ──────────────────────────────────────────────────────
      const species = mapSpecies(line.species_raw)
      const finalPetName = petName || `Pet Petlove (chip ${chip || 's/n'})`

      const { data: newPatient, error: pErr } = await supabase
        .from('patients')
        .insert({
          clinic_id:    clinicId,
          tutor_id:     tutorId,
          name:         finalPetName,
          species,
          breed:        line.breed_raw ?? null,
          gender:       'unknown',
          neutered:     false,
          microchip_id: chip || null,
          microchip:    chip || null,
          notes:        '⚠ Cadastro rápido via importação Petlove. A planilha não traz sexo, data de nascimento, peso, alergias — complete na próxima visita.',
          created_from: 'petlove_import',
        })
        .select('id')
        .single()
      if (pErr || !newPatient) {
        result.errors.push(`Linha ${line.id}: ${pErr?.message ?? 'falha ao criar patient'}`)
        continue
      }
      result.created_patients++

      // ─── Cria pet_insurance ────────────────────────────────────────────────
      const { error: piErr } = await supabase
        .from('pet_insurance')
        .insert({
          clinic_id:        clinicId,
          patient_id:       newPatient.id,
          tutor_id:         tutorId,
          provider_id:      providerId,
          plan_type:        line.plan_name_raw ?? 'Petlove',
          member_id:        line.membership_id_raw || chip || newPatient.id,
          coverage_status:  'active',
          notes:            `Cadastrado em massa via remessa ${line.remittance_id}`,
        })
      if (piErr) {
        result.errors.push(`Pet ${newPatient.id}: ${piErr.message}`)
      } else {
        result.created_pet_insurance++
      }

      // ─── Log no histórico: pet cadastrado via importação Petlove ──────────
      // Resiliente: cada bulk register dispara o evento, independente de quem chamou.
      try {
        // Pega nome do convênio para a mensagem
        const { data: prov } = await supabase
          .from('insurance_providers').select('name').eq('id', providerId).maybeSingle()
        const provName = prov?.name ?? 'Petlove'
        await supabase.from('patient_petlove_history').insert({
          clinic_id:     clinicId,
          patient_id:    newPatient.id,
          remittance_id: line.remittance_id,
          event_type:    'patient_created',
          description:   `Pet cadastrado via importação de convênio: ${provName} (plano ${line.plan_name_raw ?? '—'})`,
          metadata:      {
            provider_name: provName,
            plan_name:     line.plan_name_raw,
            microchip:     chip,
            from_line_id:  line.id,
          },
        })
      } catch {
        // não bloqueia o bulk se o log falhar
      }

      // ─── Atualiza TODAS as linhas (desta remessa) do mesmo pet ─────────────
      const orMatch = chip
        ? `microchip_raw.eq.${chip},microchip_raw.eq.#${chip}`
        : `pet_name_raw.ilike.${petName}`
      await supabase.from('petlove_remittance_lines').update({
        match_status:       'manual_resolved',
        matched_patient_id: newPatient.id,
        matched_tutor_id:   tutorId,
        resolution_action:  'patient_created_bulk',
        resolved_at:        new Date().toISOString(),
        resolved_by:        userId,
      })
      .eq('clinic_id', clinicId)
      .eq('remittance_id', line.remittance_id)
      .or(orMatch)
    } catch (err) {
      result.errors.push(`Linha ${line.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  revalidatePath('/dashboard/financial/insurance-reconciliation')
  return result
}
