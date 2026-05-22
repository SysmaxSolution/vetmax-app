'use server'

import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { runMatchEngine, bulkCreatePatientsFromPetlove } from '@/lib/actions/petlove-matching'

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
  // ─── Campos extras presentes apenas no formato em aberto ────────────────────
  gender_raw?:             string | null
  procedure_status_raw?:   string | null
  financial_status_raw?:   string | null
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
  /** 'closed' = arquivo oficial com Resumo+Extrato; 'open' = extrato em aberto (aba única Worksheet). */
  source_format:        'closed' | 'open'
  /** true para formato 'open' — remessa-prévia, sobrescrita ao reimportar. */
  is_preview:           boolean
}

export interface StageRemittanceResult {
  remittance_id:        string
  lines_count:          number
  source_format:        'closed' | 'open'
  /** Resumo dos side-effects aplicados quando is_preview=true (bulk-create + matching + cadastros + preços + entries pendentes). */
  preview_side_effects?: {
    matched:                 number
    auto_created_patients:   number
    auto_created_tutors:     number
    patients_updated:        number
    prices_updated:          number
    pending_entries_created: number
    pending_total_amount:    number
    errors:                  string[]
  }
}

export interface StageRemittanceError {
  error:                   string
  code?:                   'DUPLICATE_REMITTANCE' | 'UNKNOWN'
  existing_remittance_id?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Usa admin client em writes para garantir consistência entre clinic-switcher
// e RLS. Segurança garantida pela validação manual de clinic_id.

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
// Roteador: detecta o formato da planilha (fechada com Resumo+Extrato ou
// aberta com aba única "Worksheet") e delega para o parser específico.

export async function parsePetloveXlsx(buffer: ArrayBuffer): Promise<PetloveRemittanceAST | { error: string }> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch (err) {
    return { error: 'Arquivo .xlsx inválido ou corrompido.' }
  }

  const resumoSheet  = wb.worksheets.find(ws => /resumo/i.test(ws.name))
  const extratoSheet = wb.worksheets.find(ws => /extrato/i.test(ws.name))

  if (resumoSheet && extratoSheet) {
    return parseClosedFormat(resumoSheet, extratoSheet)
  }

  // Tenta detectar o formato "aberto" (aba única Worksheet sem cabeçalho de remessa).
  const openSheet = wb.worksheets.find(ws => isOpenFormatSheet(ws))
  if (openSheet) {
    return parseOpenFormat(openSheet)
  }

  return { error: 'Planilha fora do padrão Petlove: esperado abas "Resumo Contas Médicas" e "Extrato Contas Médicas" (formato fechado) ou aba única com colunas Valor_Repasse/Valor_Copart (formato em aberto).' }
}

function isOpenFormatSheet(ws: ExcelJS.Worksheet): boolean {
  if (ws.rowCount < 2) return false
  const headers: string[] = []
  ws.getRow(1).eachCell((cell) => {
    const t = cellText(cell.value)
    if (t) headers.push(normalizeLabel(t))
  })
  const joined = headers.join('|')
  // Marcadores únicos do formato em aberto: Valor_Repasse + Valor_Copart com underscore
  return /valor[_ ]repasse/.test(joined) && /valor[_ ]copart/.test(joined) && /atendimento/.test(joined)
}

async function parseClosedFormat(
  resumoSheet: ExcelJS.Worksheet,
  extratoSheet: ExcelJS.Worksheet,
): Promise<PetloveRemittanceAST | { error: string }> {

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
    source_format: 'closed',
    is_preview:    false,
  }
}

// ─── parseOpenFormat ──────────────────────────────────────────────────────────
// Formato em aberto: aba única ("Worksheet") sem cabeçalho de remessa.
// Colunas observadas:
//   Atendimento | Data de Realização | Nome do Cliente | Nome do Pet | Especie |
//   Raça do pet | Genero | Plano do pet | Microchip | Matricula | Veterinário |
//   Procedimento | Status Procedimento | Valor_Repasse | Valor_Copart | Status Financeiro
//
// Como não há número/período declarados, deriva-se:
//   - period_start/end = min/max das datas das linhas
//   - remittance_number sintético = "OPEN-<YYYYMM>" do mês da maior data
//   - status = 'open' / is_preview = true

async function parseOpenFormat(
  sheet: ExcelJS.Worksheet,
): Promise<PetloveRemittanceAST | { error: string }> {
  const headerRow = sheet.getRow(1)
  const colIndex: Record<string, number> = {}
  headerRow.eachCell((cell, colNumber) => {
    const label = normalizeLabel(cellText(cell.value))
    if (label) colIndex[label] = colNumber
  })

  const find = (...candidates: string[]): number | undefined => {
    for (const c of candidates) {
      const key = normalizeLabel(c)
      if (colIndex[key]) return colIndex[key]
    }
    return undefined
  }

  const COL = {
    appt:    find('Atendimento'),
    date:    find('Data de Realização', 'Data de Realizacao', 'Data do Atendimento'),
    tutor:   find('Nome do Cliente'),
    pet:     find('Nome do Pet'),
    species: find('Espécie', 'Especie'),
    breed:   find('Raça do pet', 'Raca do pet', 'Raça', 'Raca'),
    gender:  find('Genero', 'Gênero'),
    plan:    find('Plano do pet', 'Plano do Pet'),
    chip:    find('Microchip'),
    member:  find('Matrícula', 'Matricula'),
    vet:     find('Veterinário', 'Veterinario'),
    proc:    find('Procedimento'),
    statusP: find('Status Procedimento'),
    repass:  find('Valor_Repasse', 'Valor Repasse'),
    copart:  find('Valor_Copart', 'Valor Coparticipação', 'Valor Coparticipacao'),
    statusF: find('Status Financeiro'),
  }

  if (!COL.appt || !COL.date || !COL.proc || !COL.repass) {
    return { error: 'Cabeçalho do formato em aberto não tem as colunas obrigatórias (Atendimento, Data de Realização, Procedimento, Valor_Repasse).' }
  }

  const lines: PetloveRemittanceLineAST[] = []

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const apptId = cellText(row.getCell(COL.appt).value)
    if (!apptId) continue
    const isoDate = toIsoDate(row.getCell(COL.date).value)
    if (!isoDate) continue

    const chipRaw = COL.chip ? cellText(row.getCell(COL.chip).value) : null
    // Microchip no formato aberto vem sem '#'; normalizamos adicionando '#' para
    // manter compatibilidade com o matcher existente.
    const chipNormalized = chipRaw
      ? (chipRaw.startsWith('#') ? chipRaw : `#${chipRaw.replace(/^#/, '')}`)
      : null

    lines.push({
      external_appointment_id: apptId,
      service_date:            isoDate,
      tutor_name_raw:          COL.tutor   ? cellText(row.getCell(COL.tutor).value)   : null,
      pet_name_raw:            COL.pet     ? cellText(row.getCell(COL.pet).value)     : null,
      species_raw:             COL.species ? cellText(row.getCell(COL.species).value) : null,
      breed_raw:               COL.breed   ? cellText(row.getCell(COL.breed).value)   : null,
      plan_name_raw:           COL.plan    ? cellText(row.getCell(COL.plan).value)    : null,
      microchip_raw:           chipNormalized,
      membership_id_raw:       COL.member  ? cellText(row.getCell(COL.member).value)  : null,
      veterinarian_raw:        COL.vet     ? cellText(row.getCell(COL.vet).value)     : null,
      procedure_name_raw:      COL.proc    ? cellText(row.getCell(COL.proc).value)    : null,
      repass_value:            toNumber(row.getCell(COL.repass).value),
      coparticipation_value:   COL.copart  ? toNumber(row.getCell(COL.copart).value) : 0,
      gender_raw:              COL.gender  ? cellText(row.getCell(COL.gender).value)  : null,
      procedure_status_raw:    COL.statusP ? cellText(row.getCell(COL.statusP).value) : null,
      financial_status_raw:    COL.statusF ? cellText(row.getCell(COL.statusF).value) : null,
    })
  }

  if (lines.length === 0) {
    return { error: 'Nenhum atendimento encontrado na planilha em aberto.' }
  }

  // Período = min/max das datas observadas
  const sortedDates = lines.map(l => l.service_date).sort()
  const period_start = sortedDates[0]
  const period_end   = sortedDates[sortedDates.length - 1]

  // Número sintético: "OPEN-YYYYMM" do mês da maior data (= últimas movimentações)
  const [yEnd, mEnd] = period_end.split('-')
  const remittance_number = `OPEN-${yEnd}${mEnd}`

  // Totais derivados das linhas
  const total_service_value = lines.reduce((acc, l) => acc + Number(l.repass_value), 0)
  const total_gross_value   = lines.reduce((acc, l) => acc + Number(l.repass_value) + Number(l.coparticipation_value), 0)

  const raw_summary: Record<string, string | number> = {
    source:           'open_format',
    lines_count:      lines.length,
    period_start,
    period_end,
    derived_total_service_value: total_service_value,
    derived_total_gross_value:   total_gross_value,
  }

  return {
    remittance_number,
    period_start,
    period_end,
    status_raw:           'Em aberto',
    total_service_value:  Number(total_service_value.toFixed(2)),
    referral_bonus_value: 0,
    credit_adjustment:    0,
    debit_adjustment:     0,
    total_gross_value:    Number(total_gross_value.toFixed(2)),
    raw_summary,
    lines,
    source_format: 'open',
    is_preview:    true,
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

  const initialStatus = parsed.source_format === 'open' ? 'open' : 'imported'

  // Tratamento de duplicidade:
  //  - Para formato fechado (status='imported'/'reviewed'/'reconciled') mantemos
  //    o bloqueio histórico — o usuário deve excluir antes de reimportar.
  //  - Para formato aberto (status='open' / is_preview=true) permitimos
  //    sobrescrita: apaga linhas e regrava preservando o id da remessa
  //    (mantém referências de patient_custom_prices.last_remittance_id).
  const { data: dupe } = await supabase
    .from('petlove_remittances')
    .select('id, status, is_preview, imported_at')
    .eq('clinic_id', clinicId)
    .eq('provider_id', prov.id)
    .eq('remittance_number', parsed.remittance_number)
    .maybeSingle()

  if (dupe) {
    const canOverwrite = dupe.is_preview === true && dupe.status === 'open' && parsed.source_format === 'open'
    if (!canOverwrite) {
      return {
        error: 'Planilha já importada anteriormente.',
        code: 'DUPLICATE_REMITTANCE',
        existing_remittance_id: dupe.id,
      }
    }

    // Sobrescrita: antes de apagar as linhas, remove os financial_entries
    // pendentes (status='pending', source='petlove_open') vinculados a elas.
    // Entries já baixados manualmente (status='paid') NÃO são apagados —
    // ficam órfãos com petlove_remittance_line_id=NULL (FK ON DELETE SET NULL).
    const { data: oldLineIds } = await supabase
      .from('petlove_remittance_lines')
      .select('id')
      .eq('remittance_id', dupe.id)
      .eq('clinic_id', clinicId)
    const idsToClear = (oldLineIds ?? []).map(l => l.id)
    if (idsToClear.length > 0) {
      const { error: feDelErr } = await supabase
        .from('financial_entries')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('source', 'petlove_open')
        .eq('status', 'pending')
        .in('petlove_remittance_line_id', idsToClear)
      if (feDelErr) {
        return { error: `Falha ao limpar contas a receber pendentes da prévia anterior: ${feDelErr.message}` }
      }
    }

    // Apaga linhas antigas e atualiza header
    const { error: delErr } = await supabase
      .from('petlove_remittance_lines')
      .delete()
      .eq('remittance_id', dupe.id)
      .eq('clinic_id', clinicId)
    if (delErr) {
      return { error: `Falha ao limpar linhas anteriores da remessa em aberto: ${delErr.message}` }
    }

    const { error: updErr } = await supabase
      .from('petlove_remittances')
      .update({
        period_start:         parsed.period_start,
        period_end:           parsed.period_end,
        status:               'open',
        is_preview:           true,
        source_format:        'open',
        total_service_value:  parsed.total_service_value,
        referral_bonus_value: parsed.referral_bonus_value,
        credit_adjustment:    parsed.credit_adjustment,
        debit_adjustment:     parsed.debit_adjustment,
        total_gross_value:    parsed.total_gross_value,
        raw_summary:          parsed.raw_summary,
        imported_by:          userId,
        imported_at:          new Date().toISOString(),
      })
      .eq('id', dupe.id)
    if (updErr) {
      return { error: `Falha ao atualizar header da remessa em aberto: ${updErr.message}` }
    }

    const insErr = await insertLines(supabase, clinicId, dupe.id, parsed.lines)
    if (insErr) return { error: insErr }

    revalidatePath('/dashboard/financial/insurance-reconciliation')
    return { remittance_id: dupe.id, lines_count: parsed.lines.length, source_format: parsed.source_format }
  }

  const { data: remittance, error: remErr } = await supabase
    .from('petlove_remittances')
    .insert({
      clinic_id:            clinicId,
      provider_id:          prov.id,
      remittance_number:    parsed.remittance_number,
      period_start:         parsed.period_start,
      period_end:           parsed.period_end,
      status:               initialStatus,
      is_preview:           parsed.is_preview,
      source_format:        parsed.source_format,
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

  const insErr = await insertLines(supabase, clinicId, remittance.id, parsed.lines)
  if (insErr) {
    await supabase.from('petlove_remittances').delete().eq('id', remittance.id)
    return { error: insErr }
  }

  revalidatePath('/dashboard/financial/insurance-reconciliation')
  return { remittance_id: remittance.id, lines_count: parsed.lines.length, source_format: parsed.source_format }
}

async function insertLines(
  supabase: ClinicCtx['supabase'],
  clinicId: string,
  remittanceId: string,
  lines: PetloveRemittanceLineAST[],
): Promise<string | null> {
  const linesPayload = lines.map(l => ({
    clinic_id:               clinicId,
    remittance_id:           remittanceId,
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
    gender_raw:              l.gender_raw            ?? null,
    procedure_status_raw:    l.procedure_status_raw  ?? null,
    financial_status_raw:    l.financial_status_raw  ?? null,
    match_status:            'pending',
  }))

  const { error } = await supabase
    .from('petlove_remittance_lines')
    .insert(linesPayload)

  return error ? `Falha ao gravar linhas da remessa: ${error.message}` : null
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

  const staged = await stageRemittance(parsed)
  if ('error' in staged) return staged

  // ─── Side-effects da prévia em aberto ─────────────────────────────────────
  // Para o formato em aberto: roda matching automaticamente e propaga
  // (a) atualização cadastral de pets já vinculados (campos vazios),
  // (b) preço fixado em patient_custom_prices para procedimentos mapeados, e
  // (c) criação de financial_entries com status='pending' para cada linha
  //     com Status Procedimento = "Liberado" e repass > 0 — títulos a receber
  //     que serão baixados quando a remessa fechada do período chegar.
  if (parsed.is_preview) {
    const ctxForUser = await getCtx()
    if (!('error' in ctxForUser)) {
      const sideEffects = await applyPreviewSideEffects(staged.remittance_id, ctxForUser.userId)
      if (!('error' in sideEffects)) {
        staged.preview_side_effects = sideEffects
      }
    }
  }

  return staged
}

// ─── applyPreviewSideEffects ──────────────────────────────────────────────────
// Dispara matching automático e, para as linhas vinculadas a pets existentes,
// (1) preenche campos cadastrais ainda vazios e (2) registra/atualiza
// patient_custom_prices com o último repass observado. Sem mutação destrutiva:
// nunca sobrescreve dado já preenchido no cadastro do pet.

async function applyPreviewSideEffects(
  remittanceId: string,
  userId: string,
): Promise<{ matched: number; auto_created_patients: number; auto_created_tutors: number; patients_updated: number; prices_updated: number; pending_entries_created: number; pending_total_amount: number; errors: string[] } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const { supabase, clinicId } = ctx

  const errors: string[] = []
  let autoCreatedPatients = 0
  let autoCreatedTutors   = 0

  // 1) Roda matching inicial
  const matchRes = await runMatchEngine(remittanceId)
  if ('error' in matchRes) return { error: `Matching falhou: ${matchRes.error}` }

  // 2) Auto bulk-create: para cada linha em missing_patient_profile, cria
  //    tutor + pet + pet_insurance, depois reroda matching. Sem isso, pets
  //    novos ficariam fora dos entries pendentes.
  const { data: missingLines } = await supabase
    .from('petlove_remittance_lines')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('remittance_id', remittanceId)
    .eq('match_status', 'missing_patient_profile')

  if (missingLines && missingLines.length > 0) {
    const bulk = await bulkCreatePatientsFromPetlove(missingLines.map(l => l.id))
    if (!('error' in bulk)) {
      autoCreatedPatients = bulk.created_patients
      autoCreatedTutors   = bulk.created_tutors
      for (const err of bulk.errors) errors.push(`Bulk register: ${err}`)
    } else {
      errors.push(`Bulk register: ${bulk.error}`)
    }
    // Reroda matching agora que os pets existem
    const r2 = await runMatchEngine(remittanceId)
    if ('error' in r2) errors.push(`Re-matching pós bulk: ${r2.error}`)
  }

  // 3) Localiza provider Petlove (necessário para patient_custom_prices)
  const { data: provider } = await supabase
    .from('insurance_providers')
    .select('id')
    .eq('clinic_id', clinicId)
    .ilike('name', 'petlove')
    .maybeSingle()
  if (!provider?.id) {
    return { matched: matchRes.matched ?? 0, auto_created_patients: autoCreatedPatients, auto_created_tutors: autoCreatedTutors, patients_updated: 0, prices_updated: 0, pending_entries_created: 0, pending_total_amount: 0, errors: [...errors, 'Convênio Petlove não localizado para a clínica.'] }
  }
  const providerId = provider.id

  // 4) Carrega linhas que já têm pet identificado (após bulk-create + re-match)
  //    Inclui 'manual_resolved' para pegar as linhas vinculadas pelo bulk.
  const { data: lines, error: linesErr } = await supabase
    .from('petlove_remittance_lines')
    .select('id, service_date, matched_patient_id, matched_tutor_id, tutor_name_raw, pet_name_raw, gender_raw, species_raw, breed_raw, microchip_raw, plan_name_raw, procedure_name_raw, procedure_status_raw, repass_value, match_status')
    .eq('clinic_id', clinicId)
    .eq('remittance_id', remittanceId)
    .not('matched_patient_id', 'is', null)
    .in('match_status', ['matched', 'partial', 'orphan_invoice', 'manual_resolved'])

  if (linesErr) return { error: `Falha ao carregar linhas para side-effects: ${linesErr.message}` }
  if (!lines || lines.length === 0) {
    return { matched: matchRes.matched ?? 0, auto_created_patients: autoCreatedPatients, auto_created_tutors: autoCreatedTutors, patients_updated: 0, prices_updated: 0, pending_entries_created: 0, pending_total_amount: 0, errors }
  }

  let patientsUpdated = 0
  let pricesUpdated   = 0

  // 4) Atualização cadastral (1× por pet)
  const seenPatients = new Set<string>()
  for (const line of lines) {
    const patientId = line.matched_patient_id as string
    if (seenPatients.has(patientId)) continue
    seenPatients.add(patientId)

    const { data: pat } = await supabase
      .from('patients')
      .select('id, microchip_id, microchip, breed, species, gender')
      .eq('id', patientId)
      .eq('clinic_id', clinicId)
      .maybeSingle()
    if (!pat) continue

    const update: Record<string, unknown> = {}

    // Microchip: preenche apenas se cadastro não tem
    if (!pat.microchip_id && !pat.microchip && line.microchip_raw) {
      const chip = (line.microchip_raw as string).replace(/^#/, '').trim()
      if (chip) {
        update.microchip_id = chip
        update.microchip    = chip
      }
    }

    // Gênero: preenche apenas se 'unknown' ou vazio
    if ((!pat.gender || pat.gender === 'unknown') && line.gender_raw) {
      const g = String(line.gender_raw).toLowerCase()
      if (g.includes('macho'))                       update.gender = 'male'
      else if (g.includes('fêmea') || g.includes('femea')) update.gender = 'female'
    }

    // Raça: preenche apenas se vazia
    if (!pat.breed && line.breed_raw) {
      update.breed = line.breed_raw
    }

    // Espécie: corrige apenas se está como 'exotic' (placeholder) ou vazio
    if ((!pat.species || pat.species === 'exotic') && line.species_raw) {
      update.species = mapSpeciesLocal(String(line.species_raw))
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('patients')
        .update(update)
        .eq('id', patientId)
        .eq('clinic_id', clinicId)
      if (error) errors.push(`patient ${patientId}: ${error.message}`)
      else patientsUpdated++
    }
  }

  // 5) patient_custom_prices: usa mappings existentes (não cria mapping novo)
  const procNames = Array.from(new Set(
    lines.map(l => l.procedure_name_raw).filter(Boolean) as string[],
  ))

  if (procNames.length > 0) {
    const { data: mappings } = await supabase
      .from('petlove_procedure_mappings')
      .select('external_procedure_name, internal_stock_item_id')
      .eq('clinic_id', clinicId)
      .eq('provider_id', providerId)
      .in('external_procedure_name', procNames)

    const stockByProc = new Map<string, string>()
    for (const m of mappings ?? []) {
      if (m.internal_stock_item_id) stockByProc.set(m.external_procedure_name, m.internal_stock_item_id)
    }

    // Para cada (pet, procedimento), mantém apenas a observação mais recente
    type Obs = { patient: string; stock: string; price: number; serviceDate: string }
    const latestByKey = new Map<string, Obs>()
    for (const line of lines) {
      const stockId = line.procedure_name_raw ? stockByProc.get(line.procedure_name_raw as string) : null
      if (!stockId) continue
      const price = Number(line.repass_value)
      if (!Number.isFinite(price) || price <= 0) continue
      const key = `${line.matched_patient_id}::${stockId}`
      const existing = latestByKey.get(key)
      if (!existing || (line.service_date as string) > existing.serviceDate) {
        latestByKey.set(key, {
          patient:     line.matched_patient_id as string,
          stock:       stockId,
          price,
          serviceDate: line.service_date as string,
        })
      }
    }

    for (const obs of latestByKey.values()) {
      const { error } = await supabase
        .from('patient_custom_prices')
        .upsert({
          clinic_id:          clinicId,
          patient_id:         obs.patient,
          stock_item_id:      obs.stock,
          custom_price:       obs.price,
          source:             'petlove_remittance',
          provider_id:        providerId,
          last_remittance_id: remittanceId,
          last_seen_at:       new Date().toISOString(),
          observation_count:  1,
          updated_at:         new Date().toISOString(),
        }, { onConflict: 'clinic_id,patient_id,stock_item_id' })
      if (error) errors.push(`price ${obs.patient}/${obs.stock}: ${error.message}`)
      else pricesUpdated++
    }
  }

  // 6) financial_entries pendentes ─────────────────────────────────────────────
  // Para cada linha com tutor identificado, Status Procedimento = "Liberado" e
  // repass > 0: cria um entry pending (a receber em aberto). Linhas sem tutor
  // (missing_patient_profile que viraram orphan_invoice) ou em análise ficam
  // fora — Em análise pode ser glosa, melhor não inflar A Receber.
  let pendingEntriesCreated = 0
  let pendingTotalAmount    = 0

  for (const line of lines) {
    const isLiberado = line.procedure_status_raw
      ? String(line.procedure_status_raw).toLowerCase().includes('liberado')
      : true  // se a planilha não trouxer o status, assume liberado (compat. com fechado)
    if (!isLiberado) continue

    const tutorId = line.matched_tutor_id as string | null
    const patientId = line.matched_patient_id as string | null
    const repass = Number(line.repass_value)
    if (!tutorId || !Number.isFinite(repass) || repass <= 0) continue

    const procName  = (line.procedure_name_raw as string | null)?.trim() || 'Procedimento'
    const petName   = (line.pet_name_raw       as string | null)?.trim() || '?'
    const tutorName = (line.tutor_name_raw     as string | null)?.trim() || '?'
    const dueDate   = line.service_date as string

    const description = `Petlove (em aberto) · ${procName} · ${petName} (${tutorName}) · ${fmtBR(dueDate)}`
    const { error: feErr } = await supabase
      .from('financial_entries')
      .insert({
        clinic_id:                  clinicId,
        type:                       'receivable',
        description,
        amount:                     repass,
        due_date:                   dueDate,
        payment_date:               null,
        status:                     'pending',
        source:                     'petlove_open',
        category:                   'Convênios · Petlove (em aberto)',
        tutor_id:                   tutorId,
        patient_id:                 patientId,
        settlement_bank_id:         null,
        notes:                      `Prévia ${remittanceId} · linha ${line.id}. Será baixado automaticamente quando a remessa fechada do período chegar.`,
        created_by:                 userId,
        petlove_remittance_line_id: line.id,
      })
    if (feErr) {
      errors.push(`entry pending ${line.id}: ${feErr.message}`)
    } else {
      pendingEntriesCreated++
      pendingTotalAmount += repass
    }
  }

  return {
    matched:                 matchRes.matched ?? 0,
    auto_created_patients:   autoCreatedPatients,
    auto_created_tutors:     autoCreatedTutors,
    patients_updated:        patientsUpdated,
    prices_updated:          pricesUpdated,
    pending_entries_created: pendingEntriesCreated,
    pending_total_amount:    Number(pendingTotalAmount.toFixed(2)),
    errors,
  }
}

function fmtBR(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function mapSpeciesLocal(raw: string): 'dog' | 'cat' | 'bird' | 'rabbit' | 'rodent' | 'reptile' | 'fish' | 'exotic' {
  const s = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/cachorro|cao|canino/.test(s)) return 'dog'
  if (/gato|felino/.test(s))         return 'cat'
  if (/passaro|ave/.test(s))         return 'bird'
  if (/coelho/.test(s))              return 'rabbit'
  if (/hamster|porquinho|rato/.test(s)) return 'rodent'
  if (/reptil|tartaruga|cobra|iguana/.test(s)) return 'reptile'
  if (/peixe/.test(s))               return 'fish'
  return 'exotic'
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
  is_preview:        boolean
  source_format:     'closed' | 'open'
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
    .select('id, remittance_number, period_start, period_end, status, is_preview, source_format, total_gross_value, imported_at, petlove_remittance_lines(count)')
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
    is_preview:        Boolean(r.is_preview),
    source_format:     (r.source_format as 'closed' | 'open') ?? 'closed',
  }))
}
