// Dados do laudo de hemograma: lê o que JÁ existe em exam_results /
// exam_result_graphs e monta o cabeçalho (Pet, Tutor, Médico Veterinário,
// Clínica) no formato do laudo da Clínica Animais.
//
// Nada aqui interpreta resultado: os valores, unidades e faixas são os que o
// aparelho enviou. A conclusão clínica é do Médico Veterinário.

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseHL7ORU } from './hl7-parser'
import { buildHemogramReport, type HemogramReport } from './hemogram-report'
import { buildBiochemReport, isBiochemAnalyte, type BiochemReport } from './biochem-report'

export interface ReportHeader {
  os_number:   string
  os_date:     string | null      // ISO
  clinic:      { name: string; logo_url: string | null; address: string | null; phone: string | null }
  patient:     { name: string; species: string | null; breed: string | null; gender: string | null; neutered: boolean | null; birth_date: string | null }
  tutor:       { name: string | null; email: string | null; phone: string | null }
  vet:         { name: string | null; crmv: string | null; signature_url: string | null }
}

export interface ExamReportData {
  header:      ReportHeader
  report:      HemogramReport
  /** Blocos de bioquímica (Sérium 200 / BK-200). Vazio quando só veio hemograma. */
  biochem:     BiochemReport
  /** 'released' quando o Médico Veterinário já conferiu e liberou. */
  status:      'released' | 'draft' | 'empty'
  released_at: string | null
  source:      string | null
  /** Aparelho declarado no HL7 (OBR-4/MSH-4), ex.: 5190Vet. */
  device:      string | null
  collected_at: string | null
  sample_id:   string | null
  panel:       string | null
}

/** Nome comercial do aparelho a partir do identificador que ele manda no HL7. */
const DEVICE_LABELS: Record<string, string> = {
  '5190Vet': 'URIT BH-5100 Vet (ID 5190Vet)',
  'UT5160':  'URIT BH-5160 Vet',
  'BK-200':  'BioBase BK-200 Vet',
}
export const deviceLabel = (d: string | null | undefined): string | null =>
  d ? (DEVICE_LABELS[d] ?? d) : null

const SPECIES_PT: Record<string, string> = {
  dog: 'Canina', cat: 'Felina', bird: 'Aves', rabbit: 'Lagomorfa',
  rodent: 'Roedores', reptile: 'Répteis', fish: 'Peixes', exotic: 'Exótico',
}
export const speciesLabel = (s: string | null | undefined): string =>
  s ? (SPECIES_PT[s] ?? s) : '—'

export const genderLabel = (g: string | null | undefined): string =>
  g === 'male' ? 'macho' : g === 'female' ? 'fêmea' : 'sexo indef.'

export const neuteredLabel = (n: boolean | null | undefined, gender?: string | null): string => {
  if (n === null || n === undefined) return 'castração indef.'
  const o = gender === 'female' ? 'a' : gender === 'male' ? 'o' : 'o(a)'
  return n ? `castrad${o}` : `não castrad${o}`
}

/**
 * CRMV como no laudo da Animais: "CRMV-SP: 73073".
 * A coluna guarda no formato UF+número ("SP73073", validado por CHECK), então
 * concatenar "CRMV-SP " na frente sairia "CRMV-SP SP73073".
 */
export function formatCrmv(crmv: string | null | undefined): string | null {
  const s = String(crmv ?? '').trim().toUpperCase()
  if (!s) return null
  const m = s.match(/^([A-Z]{2})\s*-?\s*(\d{3,10})$/)
  return m ? `CRMV-${m[1]}: ${m[2]}` : `CRMV: ${s}`
}

/** Idade no formato da Animais: "9a 9d", "3a 2m", "5m 12d". */
export function ageLabel(birth: string | null | undefined, now = new Date()): string | null {
  if (!birth) return null
  const b = new Date(birth)
  if (Number.isNaN(b.getTime())) return null
  let years = now.getFullYear() - b.getFullYear()
  let months = now.getMonth() - b.getMonth()
  let days = now.getDate() - b.getDate()
  if (days < 0) { months -= 1; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate() }
  if (months < 0) { years -= 1; months += 12 }
  if (years < 0) return null
  if (years > 0) return months > 0 ? `${years}a ${months}m` : `${years}a ${days}d`
  if (months > 0) return `${months}m ${days}d`
  return `${days}d`
}

interface ResultRow {
  analyte_code: string | null; analyte_name: string; value_text: string
  unit: string | null; ref_text: string | null; ref_low: number | null; ref_high: number | null
  flag: string | null; status: string; source: string; released_at: string | null
  panel: string | null; raw_hl7: string | null
}

/**
 * Carrega o laudo da consulta. SEMPRE filtra por clinic_id (o admin client
 * ignora RLS). Prefere os resultados LIBERADOS; só cai no rascunho quando não
 * houver nada liberado — é assim que o laudo reflete o estado do fluxo.
 */
export async function getExamReportData(
  admin: SupabaseClient,
  clinicId: string,
  consultationId: string,
): Promise<ExamReportData | null> {
  const { data: cons } = await admin
    .from('consultations')
    .select('id, os_number, created_at, appointment_date, patient_id, vet_id')
    .eq('clinic_id', clinicId).eq('id', consultationId).maybeSingle()
  if (!cons) return null

  const [{ data: results }, { data: graphRows }, { data: clinic }] = await Promise.all([
    admin.from('exam_results')
      .select('analyte_code, analyte_name, value_text, unit, ref_text, ref_low, ref_high, flag, status, source, released_at, panel, raw_hl7')
      .eq('clinic_id', clinicId).eq('consultation_id', consultationId)
      .order('created_at', { ascending: true }),
    admin.from('exam_result_graphs')
      .select('code, title, mime, encoding, data')
      .eq('clinic_id', clinicId).eq('consultation_id', consultationId)
      .order('created_at', { ascending: true }),
    admin.from('clinics')
      .select('name, logo_url, address, phone, city, state, cep, neighborhood')
      .eq('id', clinicId).maybeSingle(),
  ])

  const [{ data: patient }, { data: vet }] = await Promise.all([
    admin.from('patients')
      .select('name, species, breed, gender, neutered, birth_date, tutor_id')
      .eq('clinic_id', clinicId).eq('id', cons.patient_id).maybeSingle(),
    cons.vet_id
      ? admin.from('profiles').select('full_name, crmv, electronic_signature_url')
          .eq('clinic_id', clinicId).eq('id', cons.vet_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const { data: tutor } = patient?.tutor_id
    ? await admin.from('tutors').select('name, email, phone')
        .eq('clinic_id', clinicId).eq('id', patient.tutor_id).maybeSingle()
    : { data: null }

  const rows = (results ?? []) as ResultRow[]
  const released = rows.filter(r => r.status === 'released')
  const use = released.length > 0 ? released : rows
  const status: ExamReportData['status'] = released.length > 0 ? 'released' : (rows.length > 0 ? 'draft' : 'empty')

  // Metadados da amostra: vêm do HL7 guardado (versão sem os payloads base64).
  const raw = use.find(r => r.raw_hl7)?.raw_hl7 ?? null
  const meta = raw ? parseHL7ORU(raw) : null
  const hl7 = meta && !('error' in meta) ? meta : null

  // Um mesmo atendimento pode ter hemograma (URIT) E bioquímica (Sérium 200):
  // os dois aparelhos escrevem na mesma consulta. Separar antes de montar evita
  // que os analitos de bioquímica caiam em "Outros parâmetros" do hemograma.
  const allAnalytes = use.map(r => ({
    code: r.analyte_code, name: r.analyte_name, value: r.value_text, unit: r.unit,
    ref_text: r.ref_text, ref_low: r.ref_low, ref_high: r.ref_high,
    flag: (r.flag as 'H' | 'L' | 'N' | 'A' | null) ?? null,
  }))
  const bioAnalytes = allAnalytes.filter(a => isBiochemAnalyte(a.code, a.name))
  const hemAnalytes = allAnalytes.filter(a => !isBiochemAnalyte(a.code, a.name))

  const report = buildHemogramReport(
    hemAnalytes,
    (graphRows ?? []).map(g => ({
      code: g.code as string, name: (g.title as string) ?? null,
      mime: g.mime as string | null, encoding: g.encoding as string | null,
      source: null, data: g.data as string,
    })),
  )

  const addr = [clinic?.address, clinic?.neighborhood].filter(Boolean).join(', ')
  const cityLine = [clinic?.city, clinic?.state].filter(Boolean).join(' / ')
  const fullAddr = [addr, [cityLine, clinic?.cep].filter(Boolean).join(' - ')].filter(Boolean).join(' · ')

  return {
    header: {
      os_number: (cons.os_number as string) ?? String(cons.id).slice(0, 8).toUpperCase(),
      os_date: (cons.appointment_date as string) ?? (cons.created_at as string) ?? null,
      clinic: {
        name: (clinic?.name as string) ?? 'Clínica',
        logo_url: (clinic?.logo_url as string) ?? null,
        address: fullAddr || null,
        phone: (clinic?.phone as string) ?? null,
      },
      patient: {
        name: (patient?.name as string) ?? '—',
        species: (patient?.species as string) ?? null,
        breed: (patient?.breed as string) ?? null,
        gender: (patient?.gender as string) ?? null,
        neutered: (patient?.neutered as boolean) ?? null,
        birth_date: (patient?.birth_date as string) ?? null,
      },
      tutor: {
        name: (tutor?.name as string) ?? null,
        email: (tutor?.email as string) ?? null,
        phone: (tutor?.phone as string) ?? null,
      },
      vet: {
        name: (vet?.full_name as string) ?? null,
        crmv: (vet?.crmv as string) ?? null,
        signature_url: (vet?.electronic_signature_url as string) ?? null,
      },
    },
    report,
    biochem: buildBiochemReport(bioAnalytes),
    status,
    released_at: released[0]?.released_at ?? null,
    source: use[0]?.source ?? null,
    device: hl7?.device ?? null,
    collected_at: hl7?.observed_at ?? null,
    sample_id: hl7?.sample_id ?? null,
    panel: use.find(r => r.panel)?.panel ?? hl7?.panel
      ?? (hemAnalytes.length === 0 && bioAnalytes.length > 0 ? 'Bioquímico' : 'Hemograma'),
  }
}
