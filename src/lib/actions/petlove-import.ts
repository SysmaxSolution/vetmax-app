'use server'

import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PetloveRemittanceLineAST {
  external_appointment_id: string
  service_date:            string  // ISO yyyy-mm-dd
  tutor_name_raw:          string | null
  pet_name_raw:            string | null
  species_raw:             string | null
  breed_raw:               string | null
  plan_name_raw:           string | null
  microchip_raw:           string | null
  membership_id_raw:       string | null
  veterinarian_raw:        string | null
  procedure_name_raw:      string | null
  repass_value:            number
  coparticipation_value:   number
}

export interface PetloveRemittanceAST {
  remittance_number:    string
  period_start:         string   // ISO yyyy-mm-dd
  period_end:           string   // ISO yyyy-mm-dd
  status_raw:           string
  total_service_value:  number
  referral_bonus_value: number
  credit_adjustment:    number
  debit_adjustment:     number
  total_gross_value:    number
  raw_summary:          Record<string, string | number>
  lines:                PetloveRemittanceLineAST[]
}

export interface StageRemittanceResult {
  remittance_id: string
  lines_count:   number
}

export interface StageRemittanceError {
  error:                   string
  code?:                   'DUPLICATE_REMITTANCE' | 'UNKNOWN'
  existing_remittance_id?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ClinicCtx = { supabase: Awaited<ReturnType<typeof createClient>>; clinicId: string; userId: string }

async function getCtx(): Promise<ClinicCtx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica vinculada.' }
  return { supabase, clinicId: profile.clinic_id, userId: user.id }
}

function normalizeLabel(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function toIsoDate(v: unknown): string | null {
  if (!v) return null
  if (v instanceof Date) {
    const yyyy = v.getUTCFullYear()
    const mm = String(v.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(v.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) {
    const [, dd, mm, yyyy] = m
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  return null
}

function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && v !== null) {
    const obj = v as { text?: string; result?: unknown; richText?: { text: string }[] }
    if (typeof obj.text === 'string') return obj.text.trim() || null
    if (Array.isArray(obj.richText)) return obj.richText.map(r => r.text).join('').trim() || null
    if (obj.result !== undefined) return String(obj.result).trim() || null
  }
  const s = String(v).trim()
  return s.length ? s : null
}

// ─── parsePetloveXlsx ─────────────────────────────────────────────────────────

export async function parsePetloveXlsx(buffer: ArrayBuffer): Promise<PetloveRemittanceAST | { error: string }> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch (err) {
    return { error: 'Arquivo .xlsx inválido ou corrompido.' }
  }

  const resumoSheet = wb.worksheets.find(ws => /resumo/i.test(ws.name)) ?? wb.worksheets[0]
  const extratoSheet = wb.worksheets.find(ws => /extrato/i.test(ws.name))

  if (!resumoSheet || !extratoSheet) {
    return { error: 'Planilha fora do padrão Petlove: abas "Resumo Contas Médicas" e "Extrato Contas Médicas" são obrigatórias.' }
  }

  // ─── Cabeçalho (aba Resumo) ─────────────────────────────────────────────────
  const summaryMap: Record<string, string | number> = {}
  resumoSheet.eachRow((row) => {
    const labelCell = cellText(row.getCell(1).value)
    const valueCell = row.getCell(2).value
    if (!labelCell) return
    const key = normalizeLabel(labelCell)
    summaryMap[key] = (typeof valueCell === 'number')
      ? valueCell
      : (cellText(valueCell) ?? '')
  })

  const remittanceNumberRaw = summaryMap[normalizeLabel('Informações da Remessa')] ?? summaryMap[normalizeLabel('Informacoes da Remessa')]
  const remittance_number = remittanceNumberRaw ? String(remittanceNumberRaw).trim() : ''
  if (!remittance_number) {
    return { error: 'Não foi possível identificar o número da remessa no cabeçalho.' }
  }

  const periodoRaw = String(summaryMap[normalizeLabel('Referente ao período')] ?? '')
  const periodoMatch = periodoRaw.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*a\s*(\d{1,2}\/\d{1,2}\/\d{4})/)
  const period_start = periodoMatch ? toIsoDate(periodoMatch[1]) : null
  const period_end   = periodoMatch ? toIsoDate(periodoMatch[2]) : null
  if (!period_start || !period_end) {
    return { error: `Não foi possível extrair o período "${periodoRaw}" no formato dd/mm/aaaa.` }
  }

  const total_service_value  = toNumber(summaryMap[normalizeLabel('Valor Total Atendimento')])
  const referral_bonus_value = toNumber(summaryMap[normalizeLabel('Referente a indicação')] ?? summaryMap[normalizeLabel('Referente a indicacao')])
  const credit_adjustment    = toNumber(summaryMap[normalizeLabel('Ajustes Crédito')] ?? summaryMap[normalizeLabel('Ajustes Credito')])
  const debit_adjustment     = toNumber(summaryMap[normalizeLabel('Ajustes Débito')] ?? summaryMap[normalizeLabel('Ajustes Debito')])
  const total_gross_value    = toNumber(summaryMap[normalizeLabel('Valor Total Bruto')])
  const status_raw           = String(summaryMap[normalizeLabel('Status da Remessa')] ?? '').trim()

  // ─── Linhas (aba Extrato) ───────────────────────────────────────────────────
  const headerRow = extratoSheet.getRow(1)
  const colIndex: Record<string, number> = {}
  headerRow.eachCell((cell, colNumber) => {
    const label = normalizeLabel(cellText(cell.value))
    if (label) colIndex[label] = colNumber
  })

  const COL = {
    appt:    colIndex[normalizeLabel('Atendimento')],
    date:    colIndex[normalizeLabel('Data do Atendimento')],
    tutor:   colIndex[normalizeLabel('Nome do Cliente')],
    pet:     colIndex[normalizeLabel('Nome do Pet')],
    species: colIndex[normalizeLabel('Espécie')] ?? colIndex[normalizeLabel('Especie')],
    breed:   colIndex[normalizeLabel('Raça')] ?? colIndex[normalizeLabel('Raca')],
    plan:    colIndex[normalizeLabel('Plano do Pet')],
    chip:    colIndex[normalizeLabel('Microchip')],
    member:  colIndex[normalizeLabel('Matrícula')] ?? colIndex[normalizeLabel('Matricula')],
    vet:     colIndex[normalizeLabel('Veterinário')] ?? colIndex[normalizeLabel('Veterinario')],
    proc:    colIndex[normalizeLabel('Procedimento')],
    repass:  colIndex[normalizeLabel('Valor Repasse')],
    copart:  colIndex[normalizeLabel('Valor Coparticipação')] ?? colIndex[normalizeLabel('Valor Coparticipacao')],
  }
  if (!COL.appt || !COL.date || !COL.proc || !COL.repass) {
    return { error: 'Cabeçalho da aba "Extrato Contas Médicas" não tem as colunas obrigatórias (Atendimento, Data do Atendimento, Procedimento, Valor Repasse).' }
  }

  const lines: PetloveRemittanceLineAST[] = []
  for (let r = 2; r <= extratoSheet.rowCount; r++) {
    const row = extratoSheet.getRow(r)
    const apptId = cellText(row.getCell(COL.appt).value)
    if (!apptId) continue
    const isoDate = toIsoDate(row.getCell(COL.date).value)
    if (!isoDate) continue

    lines.push({
      external_appointment_id: apptId,
      service_date:            isoDate,
      tutor_name_raw:          cellText(row.getCell(COL.tutor).value),
      pet_name_raw:            cellText(row.getCell(COL.pet).value),
      species_raw:             cellText(row.getCell(COL.species).value),
      breed_raw:               cellText(row.getCell(COL.breed).value),
      plan_name_raw:           cellText(row.getCell(COL.plan).value),
      microchip_raw:           cellText(row.getCell(COL.chip).value),
      membership_id_raw:       COL.member ? cellText(row.getCell(COL.member).value) : null,
      veterinarian_raw:        COL.vet ? cellText(row.getCell(COL.vet).value) : null,
      procedure_name_raw:      cellText(row.getCell(COL.proc).value),
      repass_value:            toNumber(row.getCell(COL.repass).value),
      coparticipation_value:   COL.copart ? toNumber(row.getCell(COL.copart).value) : 0,
    })
  }

  if (lines.length === 0) {
    return { error: 'Nenhuma linha de procedimento foi encontrada na aba "Extrato Contas Médicas".' }
  }

  return {
    remittance_number,
    period_start,
    period_end,
    status_raw,
    total_service_value,
    referral_bonus_value,
    credit_adjustment,
    debit_adjustment,
    total_gross_value,
    raw_summary: summaryMap,
    lines,
  }
}

// ─── Provider find-or-create ──────────────────────────────────────────────────

async function findOrCreatePetloveProvider(
  supabase: ClinicCtx['supabase'],
  clinicId: string,
): Promise<{ id: string } | { error: string }> {
  const { data: existing } = await supabase
    .from('insurance_providers')
    .select('id')
    .eq('clinic_id', clinicId)
    .ilike('name', 'petlove')
    .maybeSingle()

  if (existing?.id) return { id: existing.id }

  const { data, error } = await supabase
    .from('insurance_providers')
    .insert({
      clinic_id:    clinicId,
      name:         'Petlove',
      plan_types:   ['Leve', 'Ideal', 'Tranquilo', 'Premium'],
      portal_url:   'https://www.petlove.com.br/credenciado',
      contact_info: {},
      is_active:    true,
    })
    .select('id')
    .single()

  if (error) return { error: `Falha ao cadastrar convênio Petlove: ${error.message}` }
  return { id: data.id }
}

// ─── stageRemittance ──────────────────────────────────────────────────────────

export async function stageRemittance(parsed: PetloveRemittanceAST): Promise<StageRemittanceResult | StageRemittanceError> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId, userId } = ctx

  const prov = await findOrCreatePetloveProvider(supabase, clinicId)
  if ('error' in prov) return prov

  // Bloqueio de duplicidade
  const { data: dupe } = await supabase
    .from('petlove_remittances')
    .select('id, status, imported_at')
    .eq('clinic_id', clinicId)
    .eq('provider_id', prov.id)
    .eq('remittance_number', parsed.remittance_number)
    .maybeSingle()
  if (dupe) {
    return {
      error: 'Planilha já importada anteriormente.',
      code: 'DUPLICATE_REMITTANCE',
      existing_remittance_id: dupe.id,
    }
  }

  const { data: remittance, error: remErr } = await supabase
    .from('petlove_remittances')
    .insert({
      clinic_id:            clinicId,
      provider_id:          prov.id,
      remittance_number:    parsed.remittance_number,
      period_start:         parsed.period_start,
      period_end:           parsed.period_end,
      status:               'imported',
      total_service_value:  parsed.total_service_value,
      referral_bonus_value: parsed.referral_bonus_value,
      credit_adjustment:    parsed.credit_adjustment,
      debit_adjustment:     parsed.debit_adjustment,
      total_gross_value:    parsed.total_gross_value,
      raw_summary:          parsed.raw_summary,
      imported_by:          userId,
    })
    .select('id')
    .single()

  if (remErr || !remittance) {
    return { error: `Falha ao gravar header da remessa: ${remErr?.message ?? 'erro desconhecido'}` }
  }

  const linesPayload = parsed.lines.map(l => ({
    clinic_id:               clinicId,
    remittance_id:           remittance.id,
    external_appointment_id: l.external_appointment_id,
    service_date:            l.service_date,
    tutor_name_raw:          l.tutor_name_raw,
    pet_name_raw:            l.pet_name_raw,
    species_raw:             l.species_raw,
    breed_raw:               l.breed_raw,
    plan_name_raw:           l.plan_name_raw,
    microchip_raw:           l.microchip_raw,
    membership_id_raw:       l.membership_id_raw,
    veterinarian_raw:        l.veterinarian_raw,
    procedure_name_raw:      l.procedure_name_raw,
    repass_value:            l.repass_value,
    coparticipation_value:   l.coparticipation_value,
    match_status:            'pending',
  }))

  const { error: linesErr } = await supabase
    .from('petlove_remittance_lines')
    .insert(linesPayload)

  if (linesErr) {
    await supabase.from('petlove_remittances').delete().eq('id', remittance.id)
    return { error: `Falha ao gravar linhas da remessa: ${linesErr.message}` }
  }

  revalidatePath('/dashboard/financial/insurance-reconciliation')
  return { remittance_id: remittance.id, lines_count: parsed.lines.length }
}

// ─── uploadAndStagePetloveRemittance (entry-point do dropzone) ────────────────

export async function uploadAndStagePetloveRemittance(
  formData: FormData,
): Promise<StageRemittanceResult | StageRemittanceError> {
  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'Nenhum arquivo enviado.' }
  if (!/\.xlsx$/i.test(file.name)) return { error: 'Apenas arquivos .xlsx são aceitos.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'Arquivo excede 10 MB.' }

  const buffer = await file.arrayBuffer()
  const parsed = await parsePetloveXlsx(buffer)
  if ('error' in parsed) return parsed

  return stageRemittance(parsed)
}

// ─── listImportedRemittances (para histórico no UI) ───────────────────────────

export interface ImportedRemittanceSummary {
  id:                string
  remittance_number: string
  period_start:      string
  period_end:        string
  status:            string
  total_gross_value: number
  lines_count:       number
  imported_at:       string
}

// ─── getPetlovePriceHistoryForPet ─────────────────────────────────────────────

export interface PetlovePriceHistoryItem {
  procedure_name:    string
  last_repass_value: number
  last_service_date: string
  observation_count: number
  plan_name:         string | null
  /** true se há registro em patient_custom_prices vinculando este procedimento ao pet. */
  price_fixed:       boolean
}

export async function getPetlovePriceHistoryForPet(
  patientId: string,
): Promise<PetlovePriceHistoryItem[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data: patient } = await supabase
    .from('patients')
    .select('microchip_id, microchip')
    .eq('id', patientId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  const chip = (patient?.microchip_id ?? patient?.microchip ?? '').replace(/^#/, '').trim()

  let query = supabase
    .from('petlove_remittance_lines')
    .select('procedure_name_raw, repass_value, service_date, plan_name_raw, microchip_raw, matched_patient_id')
    .eq('clinic_id', clinicId)
    .order('service_date', { ascending: false })
    .limit(500)

  if (chip) {
    query = query.or(`matched_patient_id.eq.${patientId},microchip_raw.eq.${chip},microchip_raw.eq.#${chip}`)
  } else {
    query = query.eq('matched_patient_id', patientId)
  }

  const { data, error } = await query
  if (error) return { error: error.message }

  const byProcedure = new Map<string, PetlovePriceHistoryItem>()
  for (const row of data ?? []) {
    const name = (row.procedure_name_raw ?? '').trim()
    if (!name) continue
    const existing = byProcedure.get(name)
    if (!existing) {
      byProcedure.set(name, {
        procedure_name:    name,
        last_repass_value: Number(row.repass_value),
        last_service_date: row.service_date,
        observation_count: 1,
        plan_name:         row.plan_name_raw ?? null,
        price_fixed:       false,
      })
    } else {
      existing.observation_count += 1
    }
  }

  // ─── Marca quais procedimentos têm preço fixado em patient_custom_prices ──
  const items = Array.from(byProcedure.values())
  if (items.length > 0) {
    const { data: provider } = await supabase
      .from('insurance_providers')
      .select('id')
      .eq('clinic_id', clinicId)
      .ilike('name', 'petlove')
      .maybeSingle()
    if (provider?.id) {
      const { data: mappings } = await supabase
        .from('petlove_procedure_mappings')
        .select('external_procedure_name, internal_stock_item_id')
        .eq('clinic_id', clinicId)
        .eq('provider_id', provider.id)
        .in('external_procedure_name', items.map(i => i.procedure_name))
      const stockIdByName = new Map<string, string>()
      for (const m of mappings ?? []) {
        if (m.internal_stock_item_id) stockIdByName.set(m.external_procedure_name, m.internal_stock_item_id)
      }
      const stockIds = Array.from(stockIdByName.values())
      if (stockIds.length > 0) {
        const { data: customs } = await supabase
          .from('patient_custom_prices')
          .select('stock_item_id')
          .eq('clinic_id', clinicId)
          .eq('patient_id', patientId)
          .in('stock_item_id', stockIds)
        const fixedStockIds = new Set((customs ?? []).map(c => c.stock_item_id))
        for (const item of items) {
          const stockId = stockIdByName.get(item.procedure_name)
          if (stockId && fixedStockIds.has(stockId)) item.price_fixed = true
        }
      }
    }
  }

  return items.sort((a, b) => a.procedure_name.localeCompare(b.procedure_name, 'pt-BR'))
}

export async function listImportedRemittances(): Promise<ImportedRemittanceSummary[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const { data, error } = await supabase
    .from('petlove_remittances')
    .select('id, remittance_number, period_start, period_end, status, total_gross_value, imported_at, petlove_remittance_lines(count)')
    .eq('clinic_id', clinicId)
    .order('imported_at', { ascending: false })
    .limit(20)

  if (error) return { error: error.message }
  return (data ?? []).map(r => ({
    id:                r.id,
    remittance_number: r.remittance_number,
    period_start:      r.period_start,
    period_end:        r.period_end,
    status:            r.status,
    total_gross_value: Number(r.total_gross_value),
    lines_count:       Array.isArray(r.petlove_remittance_lines) ? (r.petlove_remittance_lines[0]?.count ?? 0) : 0,
    imported_at:       r.imported_at,
  }))
}
