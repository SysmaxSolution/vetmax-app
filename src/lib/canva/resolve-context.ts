/**
 * Monta o ResolveContext para o motor Canvas Visual a partir do banco.
 *
 * Centralizado aqui (em vez de na rota de print) porque será reaproveitado
 * por previews em listagens, exports e a tela de edição do vet.
 *
 * Campos disponíveis no contexto seguem os paths declarados em
 * src/lib/canva/dynamic-tags.ts — manter os dois em sincronia.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResolveContext } from './dynamic-tags'
import { MOCK_PATIENT, MOCK_TUTOR, buildMockConsultation } from './mock-data'
import { extractEntitiesFromAnamneseCore } from '@/lib/ai/anamnese-extractor'

const ROLE_LABELS: Record<string, string> = {
  admin:        'Administrador',
  vet:          'Médico Veterinário',
  assistant:    'Auxiliar Veterinário',
  receptionist: 'Recepcionista',
  pharmacist:   'Técnico',
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  vet_clinic:     'Clínica Veterinária',
  pet_aesthetics: 'Estética Pet',
}

const VISIT_REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta',
  follow_up:    'Retorno',
  emergency:    'Emergência',
  vaccination:  'Vacinação',
  exam:         'Exame',
  surgery:      'Cirurgia',
}

// PT-BR canônico — mesmo mapa usado por VetWorkspace/PatientsWorkspace/etc.
// Mantém consistência entre o que aparece nos prontuários e o que sai nos
// laudos impressos (CFMV exige termos em português).
const SPECIES_LABELS: Record<string, string> = {
  dog: 'Canino', cat: 'Felino', feline: 'Felino', canine: 'Canino',
  bird: 'Ave', rabbit: 'Coelho', rodent: 'Roedor', reptile: 'Réptil',
  fish: 'Peixe', exotic: 'Exótico',
}

function translateSpecies(raw: string | null | undefined): string {
  if (!raw) return ''
  const k = String(raw).trim().toLowerCase()
  return SPECIES_LABELS[k] ?? raw
}

/** Resolve cidade/UF da clínica em 3 níveis de preferência:
 *    1. Campos próprios (clinics.city, clinics.state) — migration 0171
 *    2. cnpj_data.municipio / cnpj_data.uf (vem da API ReceitaWS)
 *    3. Parse heurístico do address (formato livre)
 *  Garante UF maiúsculo. */
function extractCityState(
  ownCity: string | null | undefined,
  ownState: string | null | undefined,
  address: string | null | undefined,
  cnpjData: Record<string, unknown> | null | undefined,
): { city: string; state: string } {
  // Preferência 1: campos próprios (admin cadastrou explicitamente)
  if (ownCity || ownState) {
    return { city: (ownCity ?? '').trim(), state: (ownState ?? '').trim().toUpperCase() }
  }
  // Preferência 2: cnpj_data
  const cMun = cnpjData?.municipio as string | undefined
  const cUf = cnpjData?.uf as string | undefined
  if (cMun || cUf) return { city: cMun ?? '', state: (cUf ?? '').toUpperCase() }

  // Preferência 3: parse do address
  if (!address) return { city: '', state: '' }
  const slashMatch = address.match(/([A-Za-zÀ-ú\s.]+)\s*[\/\-]\s*([A-Z]{2})\s*$/u)
  if (slashMatch) {
    return { city: slashMatch[1].trim(), state: slashMatch[2].trim() }
  }
  return { city: '', state: '' }
}

interface BusinessHourEntry {
  open?: string
  close?: string
  open_morning?: string
  close_morning?: string
  open_afternoon?: string
  close_afternoon?: string
  closed?: boolean
}

const DAY_SHORT: Record<string, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
}

function formatBusinessHoursLabel(hours: unknown): string {
  if (!hours || typeof hours !== 'object') return ''
  const entries = hours as Record<string, BusinessHourEntry>
  // Agrupa dias com horário idêntico em um único bloco
  const blocks: Array<{ days: string[]; hours: string }> = []
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    const e = entries[day]
    if (!e || e.closed) continue
    const hoursStr = e.open && e.close
      ? `${e.open}–${e.close}`
      : (e.open_morning && e.close_afternoon
          ? `${e.open_morning}–${e.close_morning} / ${e.open_afternoon}–${e.close_afternoon}`
          : '')
    if (!hoursStr) continue
    const last = blocks[blocks.length - 1]
    if (last && last.hours === hoursStr) last.days.push(day)
    else blocks.push({ days: [day], hours: hoursStr })
  }
  return blocks.map(b => {
    const range = b.days.length === 1
      ? DAY_SHORT[b.days[0]]
      : `${DAY_SHORT[b.days[0]]}–${DAY_SHORT[b.days[b.days.length - 1]]}`
    return `${range} ${b.hours}`
  }).join(' · ')
}

function calculateAge(birthDate: string | null | undefined): string {
  if (!birthDate) return ''
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return ''
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--
  if (years >= 1) return `${years} ano${years > 1 ? 's' : ''}`
  // bebês: meses
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + m
  return `${Math.max(0, months)} ${months !== 1 ? 'meses' : 'mês'}`
}

// Usado em buildResolveContext quando o documentDate é a "agora".
// Exportado para reuso em buildPreviewContext (mesma semântica de data).

/**
 * buildPreviewContext — para pré-visualização do template no editor.
 * Usa clínica + vet REAIS do usuário logado (logo, CNPJ, CRMV próprios),
 * mas pet/tutor/consulta são mock fixo (Toby / Maria Silva / data de hoje).
 * Assim o admin vê o layout com os próprios assets sem precisar de uma
 * consulta de verdade aberta.
 */
export async function buildPreviewContext(
  supabase: SupabaseClient,
  clinicId: string,
  userId: string,
): Promise<ResolveContext> {
  const [clinic, vet] = await Promise.all([
    supabase.from('clinics')
      .select('id, name, cnpj, cnpj_data, phone, address, business_type, business_hours, logo_url, city, state, cep, neighborhood')
      .eq('id', clinicId).single()
      .then(r => r.data),
    supabase.from('profiles')
      .select('id, full_name, nickname, role, crmv, specialty, specialties, phone, photo_url, electronic_signature_url, mapa_code, username')
      .eq('id', userId).single()
      .then(r => r.data),
  ])

  return {
    patient: { ...MOCK_PATIENT },
    tutor: { ...MOCK_TUTOR },
    consultation: buildMockConsultation(),
    clinic: clinic ? (() => {
      const { city, state: uf } = extractCityState(
        clinic.city ?? undefined,
        clinic.state ?? undefined,
        clinic.address ?? undefined,
        clinic.cnpj_data as Record<string, unknown> | null | undefined,
      )
      return {
        ...clinic,
        city,
        state: uf,
        city_state: city && uf ? `${city}/${uf}` : (city || uf),
        business_type_label: BUSINESS_TYPE_LABELS[clinic.business_type] ?? clinic.business_type,
        business_hours_label: formatBusinessHoursLabel(clinic.business_hours),
        razao_social: (clinic.cnpj_data as { razao_social?: string } | null)?.razao_social ?? clinic.name,
      }
    })() : {},
    vet: vet ? {
      ...vet,
      role_label: ROLE_LABELS[vet.role] ?? vet.role,
      specialty: vet.specialty ?? (Array.isArray(vet.specialties) ? vet.specialties.join(', ') : ''),
    } : {},
  }
}

export interface BuildContextOptions {
  /** Data a ser usada nas tags consulta.date/datetime/day/month/year/etc.
   *  Default: data ATUAL (new Date()). Para impressão de doc salvo,
   *  passar patient_document.created_at — preserva a data real da emissão. */
  documentDate?: Date
  /** Quando true (default), se a tabela `prescriptions` da consulta
   *  estiver vazia E `vet_notes`/`audio_transcript` mencionarem
   *  prescrições, chama o Nível 3 (extração IA) e injeta as receitas
   *  inferidas em `consultation.prescriptions`. Desligue em testes ou
   *  quando o caller já garantiu hidratação client-side. */
  extractFromAnamnese?: boolean
  /** Texto adicional do form em edição (ex: `static_fields.medicamentos`
   *  ainda não persistido) que deve ser anexado ao texto enviado à IA.
   *  Usado pelo preview ao vivo do consultório. */
  extraAnamneseText?: string
}

// Normaliza enums do banco para os valores canônicos que o RepeaterRenderer
// reconhece em PRESCRIPTION_GROUP_LABEL (src/components/canva/editor/ElementRenderers.tsx).
// Sem isso, o agrupamento por via/tipo exibe literais como "iv" e "blue_receipt"
// em vez de "Endovenoso (EV)" / "Medicamentos Controlados".
const ROUTE_DB_TO_CANON: Record<string, string> = {
  oral:       'oral',
  iv:         'intravenous',
  im:         'intramuscular',
  subcutaneo: 'subcutaneous',
  topico:     'topical',
  inalacao:   'inalação',
  outro:      'outras vias',
}
// Códigos do select de ExamRequestModal → rótulo humano no documento impresso.
// exam_type "outro" grava texto livre, que passa direto pelo fallback.
const EXAM_TYPE_LABELS: Record<string, string> = {
  hemograma:           'Hemograma Completo',
  bioquimico:          'Perfil Bioquímico',
  urinanalise:         'Urinálise',
  coproparasitologico: 'Coproparasitológico',
  ultrassom:           'Ultrassom',
  raio_x:              'Raio-X',
  eletrocardiograma:   'Eletrocardiograma (ECG)',
  citologia:           'Citologia',
  cultura:             'Cultura e Antibiograma',
  teste_rapido:        'Teste Rápido (FIV/FeLV/4DX)',
}

const PRESC_TYPE_DB_TO_CANON: Record<string, string> = {
  standard:       'common',
  blue_receipt:   'controlled',
  yellow_receipt: 'controlled',
  special:        'controlled',
}

function formatDateBRShort(raw: string | null | undefined): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR')
}

export async function buildResolveContext(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  consultationId: string,
  options: BuildContextOptions = {},
): Promise<ResolveContext> {
  const [patient, consultation, clinic, prescriptionsRaw, examRequestsRaw, vaccinesRaw] = await Promise.all([
    supabase.from('patients')
      .select('id, name, species, breed, gender, neutered, birth_date, microchip, color, tutor_id')
      .eq('id', patientId).single()
      .then(r => r.data),
    supabase.from('consultations')
      .select('id, vet_id, vet_notes, suggested_diagnosis, created_at, weight, vital_signs, appointment_date')
      .eq('id', consultationId).single()
      .then(r => r.data),
    supabase.from('clinics')
      .select('id, name, cnpj, cnpj_data, phone, address, business_type, business_hours, logo_url, city, state, cep, neighborhood')
      .eq('id', clinicId).single()
      .then(r => r.data),
    supabase.from('prescriptions')
      .select('id, medication, dose, frequency, duration_days, is_controlled, prescription_type, route_of_administration, pharmaceutical_form, created_at')
      .eq('consultation_id', consultationId)
      .order('created_at', { ascending: true })
      .then(r => r.data ?? []),
    supabase.from('exam_requests')
      .select('id, exam_type, status, notes, requested_at')
      .eq('consultation_id', consultationId)
      .order('requested_at', { ascending: true })
      .then(r => r.data ?? []),
    supabase.from('patient_vaccines')
      .select('id, vaccine_name, date_administered, next_due_date')
      .eq('patient_id', patientId)
      .order('date_administered', { ascending: false })
      .then(r => r.data ?? []),
  ])

  // Mapeia para o shape que macros.ts/ElementRenderers consomem (mesmo de MOCK_PRESCRIPTIONS).
  let prescriptions: Array<Record<string, unknown>> = (prescriptionsRaw ?? []).map(p => ({
    medication:              p.medication,
    dose:                    p.dose,
    frequency:               p.frequency,
    duration_days:           p.duration_days,
    is_controlled:           Boolean(p.is_controlled),
    prescription_type:       PRESC_TYPE_DB_TO_CANON[p.prescription_type as string] ?? p.prescription_type,
    route_of_administration: ROUTE_DB_TO_CANON[p.route_of_administration as string] ?? p.route_of_administration,
    pharmaceutical_form:     p.pharmaceutical_form ?? '',
  }))

  // Nível 3 — extração via IA quando a tabela `prescriptions` está vazia
  // mas o MV ditou medicações em texto livre (vet_notes / audio_transcript
  // / static_fields.medicamentos do form em edição).
  const extractEnabled = options.extractFromAnamnese !== false
  if (extractEnabled && prescriptions.length === 0) {
    const consultRecord = consultation as Record<string, unknown> | null
    const anamneseText = [
      consultRecord?.vet_notes as string | null | undefined,
      consultRecord?.audio_transcript as string | null | undefined,
      options.extraAnamneseText,
    ].filter(Boolean).join('\n\n')
    if (anamneseText.trim().length > 0) {
      try {
        const extracted = await extractEntitiesFromAnamneseCore(anamneseText)
        if (extracted.prescriptions.length > 0) {
          prescriptions = extracted.prescriptions.map(p => ({
            ...p,
            // Sinaliza no contexto que estes vieram da camada IA — UI pode
            // exibir badge "extraído da anamnese" no preview.
            _source: extracted.source,
            _confidence: extracted.confidence,
          }))
        }
      } catch (e) {
        console.error('[buildResolveContext] anamnese extraction failed:', e)
      }
    }
  }

  // O macro de exames agrupa por `urgency` — preserva o status como agrupador
  // (pending/in_progress/completed) e expõe `name` para o itemTemplate "{{name}}".
  const examItems = (examRequestsRaw ?? []).map(e => ({
    name:    EXAM_TYPE_LABELS[e.exam_type as string] ?? e.exam_type,
    urgency: e.status ?? 'rotina',
    notes:   e.notes ?? '',
  }))

  const vaccines = (vaccinesRaw ?? []).map(v => ({
    name: v.vaccine_name,
    date: formatDateBRShort(v.date_administered),
    next: formatDateBRShort(v.next_due_date),
  }))

  const tutor = patient?.tutor_id
    ? await supabase.from('tutors')
        .select('id, name, cpf, email, phone, address')
        .eq('id', patient.tutor_id).single()
        .then(r => r.data)
    : null

  // Schema usa vet_id (migration 0001). Se algum dia a tabela tiver
  // professional_id também, manter o fallback evita regressão silenciosa.
  const vetUserId = (consultation as Record<string, unknown> | null)?.vet_id
    ?? (consultation as Record<string, unknown> | null)?.professional_id
  const vet = vetUserId
    ? await supabase.from('profiles')
        .select('id, full_name, nickname, role, crmv, specialty, specialties, phone, photo_url, electronic_signature_url, mapa_code, username')
        .eq('id', vetUserId as string).single()
        .then(r => r.data)
    : null

  const vitalSigns = (consultation?.vital_signs as Record<string, unknown> | null) ?? null
  const chiefComplaint = typeof vitalSigns?.chief_complaint === 'string' ? vitalSigns.chief_complaint : null

  return {
    patient: patient ? {
      ...patient,
      // CFMV: laudos em PT-BR — traduz códigos do banco ("dog"/"cat") para
      // o termo clínico correto exibido no editor e nos prints.
      species: translateSpecies(patient.species),
      age: calculateAge(patient.birth_date),
      sex: patient.gender === 'male' ? 'Macho' : patient.gender === 'female' ? 'Fêmea' : 'Indef.',
      weight: consultation?.weight ?? null,
    } : {},

    tutor: tutor ?? {},

    consultation: consultation ? {
      // Data do DOCUMENTO sendo gerado (não da consulta original).
      // Default: agora. Para print de doc salvo, page.tsx passa created_at
      // do patient_document — preserva a data histórica da emissão.
      date: (options.documentDate ?? new Date()).toISOString(),
      datetime: (options.documentDate ?? new Date()).toISOString(),
      // consultation_created_at fica disponível para casos que precisem
      // da data REAL de início da consulta (separada do doc emitido).
      consultation_created_at: consultation.created_at,
      // Motivo da visita vem do campo `vital_signs.visit_reason` (triagem
      // salva ali) quando existir; consultations.visit_reason não existe.
      visit_reason_label:
        VISIT_REASON_LABELS[(vitalSigns?.visit_reason as string) ?? ''] ?? '',
      diagnosis: consultation.suggested_diagnosis ?? consultation.vet_notes ?? '',
      complaint: chiefComplaint ?? '',
      weight: consultation.weight ?? null,
      temperature: (vitalSigns?.temperature as number | undefined) ?? null,
      // Listas consumidas pelo RepeaterElement (Receituário, Solicitação de
      // Exames, Vacinas). Sem elas, os repeaters renderizam vazio mesmo
      // quando o vet preencheu medicações na consulta.
      prescriptions,
      exam_items: examItems,
      vaccines,
    } : {},

    clinic: clinic ? (() => {
      const { city, state: uf } = extractCityState(
        clinic.city ?? undefined,
        clinic.state ?? undefined,
        clinic.address ?? undefined,
        clinic.cnpj_data as Record<string, unknown> | null | undefined,
      )
      return {
        ...clinic,
        city,
        state: uf,
        city_state: city && uf ? `${city}/${uf}` : (city || uf),
        business_type_label: BUSINESS_TYPE_LABELS[clinic.business_type] ?? clinic.business_type,
        business_hours_label: formatBusinessHoursLabel(clinic.business_hours),
        razao_social: (clinic.cnpj_data as { razao_social?: string } | null)?.razao_social ?? clinic.name,
      }
    })() : {},

    vet: vet ? {
      ...vet,
      role_label: ROLE_LABELS[vet.role] ?? vet.role,
      specialty: vet.specialty ?? (Array.isArray(vet.specialties) ? vet.specialties.join(', ') : ''),
    } : {},
  }
}
