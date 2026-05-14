// SysVetMax — TypeScript Types
// Espelha o schema: supabase/migrations/0001_initial_schema.sql

export type UserRole = 'admin' | 'vet' | 'assistant' | 'receptionist' | 'pharmacist' | 'pending'

export type PatientSpecies = 'dog' | 'cat' | 'bird' | 'rabbit' | 'rodent' | 'reptile' | 'fish' | 'exotic'

export type PatientGender = 'male' | 'female' | 'unknown'

// Padrão CFMV para status reprodutivo
export type ReproductiveStatus = 'Macho Inteiro' | 'Macho Castrado' | 'Fêmea Inteira' | 'Fêmea Castrada' | 'Desconhecido'

export const REPRODUCTIVE_STATUS_OPTIONS: { value: ReproductiveStatus; label: string }[] = [
  { value: 'Macho Inteiro',   label: 'Macho Inteiro' },
  { value: 'Macho Castrado',  label: 'Macho Castrado' },
  { value: 'Fêmea Inteira',   label: 'Fêmea Inteira' },
  { value: 'Fêmea Castrada',  label: 'Fêmea Castrada' },
  { value: 'Desconhecido',    label: 'Desconhecido' },
]

export type ConsultationStatus =
  | 'scheduled_future'
  | 'reception'
  | 'scheduled'
  | 'triage'
  | 'in_progress'
  | 'waiting_exam'
  | 'medication'
  | 'completed'
  | 'cancelled'

export type VisitReason = 'consultation' | 'follow_up' | 'emergency' | 'vaccination' | 'exam' | 'surgery'
export type PaymentMethod = 'cash' | 'card' | 'pix' | 'insurance' | 'other'
export type PaymentStatus = 'pending' | 'paid' | 'courtesy'
export type MucousColor = 'pink' | 'pale' | 'icteric' | 'cyanotic'
export type CRT = '2s' | '3s' | '4s'

// ── Vital Signs (Sinais Vitais) ──────────────────────────────────────────────

export interface VitalSigns {
  weight: number              // kg
  temperature: number         // °C retal
  heart_rate: number         // bpm
  respiratory_rate: number   // movimentos/min
  mucous_color: MucousColor  // pink | pale | icteric | cyanotic
  crt: CRT                   // 2s | 3s | 4s
  chief_complaint: string    // Queixa principal (transcrição ou digitação)
}

// ── Entidades ────────────────────────────────────────────────────────────────

export interface Clinic {
  id: string
  name: string
  reception_checklist: string[] | null
  created_at: string
}

export interface Profile {
  id: string
  clinic_id: string
  full_name: string
  role: UserRole
  crmv: string | null
  created_at: string
}

export interface Tutor {
  id: string
  clinic_id: string
  name: string
  cpf: string
  email: string | null
  phone: string
  address: string | null
  emergency_contact: string | null
  created_at: string
}

export interface Patient {
  id: string
  clinic_id: string
  tutor_id: string
  name: string
  species: PatientSpecies
  breed: string | null
  gender: PatientGender | null
  neutered: boolean
  birth_date: string | null
  microchip: string | null
  photo_url: string | null
  color: string | null
  allergies: string | null
  past_surgeries: string | null
  chronic_diseases: string | null
  notes: string | null
  created_at: string
}

export interface Consultation {
  id: string
  clinic_id: string
  patient_id: string
  vet_id: string | null
  status: ConsultationStatus
  // Recepção (preenchidos na check-in)
  visit_reason: VisitReason
  scheduled_date: string | null    // Data agendada (se for agendamento futuro)
  // Triagem (preenchidos pelo assistant)
  weight: number | null           // kg — NUMERIC(5,2)
  temperature: number | null      // °C retal — NUMERIC(4,1)
  triage_notes: string | null
  vital_signs: VitalSigns | null  // JSONB com sinais vitais completos
  // Clínico (preenchidos pelo vet)
  vet_notes: string | null
  audio_transcript: string | null
  suggested_diagnosis: string | null
  is_reviewed_by_vet: boolean
  // Agendamento e pagamento
  appointment_date: string | null
  payment_method: PaymentMethod | null
  payment_status: PaymentStatus
  // Metadados
  created_at: string
  updated_at: string
}

// ── Joins comuns ─────────────────────────────────────────────────────────────

export interface PatientWithTutor extends Patient {
  tutor: Pick<Tutor, 'id' | 'name' | 'phone' | 'cpf'>
}

export interface ConsultationWithPatient extends Consultation {
  patient: PatientWithTutor
}

export interface ConsultationFull extends ConsultationWithPatient {
  vet: Pick<Profile, 'id' | 'full_name' | 'crmv'> | null
}

// ── Payloads de criação ──────────────────────────────────────────────────────

export interface CreateTutorPayload {
  name?: string
  cpf?: string
  email?: string
  phone?: string
  address?: string
}

export interface CreatePatientPayload {
  tutor_id: string
  name: string
  species: PatientSpecies
  breed?: string
  gender?: PatientGender
  neutered?: boolean
  birth_date?: string
  microchip?: string
  color?: string
  allergies?: string
  past_surgeries?: string
  chronic_diseases?: string
  notes?: string
  behavior_tags?: string[]
}

export interface CreateConsultationPayload {
  patient_id: string
  status: 'reception' | 'scheduled_future'
  appointment_date?: string
  payment_method?: PaymentMethod
}

export interface CheckInPayload {
  patient_id: string
  visit_reason: VisitReason
  payment_status: PaymentStatus
  payment_method?: PaymentMethod
  scheduled_date?: string          // Se agendado, fornecer data
  weight?: number                  // Peso atual aferido na recepção (kg)
}

export interface TriageUpdatePayload {
  weight: number       // kg
  temperature: number  // °C retal
  triage_notes?: string
}

// ── Document Templates ───────────────────────────────────────────────────────

export type TemplateType = 'laudo' | 'receita' | 'encaminhamento' | 'termo' | 'exame' | 'outro'

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'boolean' | 'textarea'

export interface ExtractedField {
  field_name: string      // snake_case, ex: "diagnostico_presuntivo"
  label: string           // PT-BR, ex: "Diagnóstico Presuntivo"
  type: FieldType
  description: string     // Contexto para IA, ex: "Resumo da suspeita clínica"
  required: boolean
  // Coordenadas visuais sobre a imagem do documento (% da pagina)
  x_percent?: number
  y_percent?: number
  width_percent?: number
  height_percent?: number
  page?: number           // Indice da pagina (0-based)
}

// ── Pixel Perfect — Layout Overlay (snapshot do editor) ──────────────────────
// Fonte unica da verdade para preview/editor/geracao pdf-lib.

export type OverlayElementType = 'field' | 'text' | 'logo' | 'signature' | 'image'

export interface LayoutOverlay {
  id: string
  type: OverlayElementType
  field_name?: string                   // quando type='field'
  label: string
  content?: string                      // quando type='text'
  page: number                          // 0-based, qual pagina do PDF original
  x_pct: number                         // % da largura da pagina
  y_pct: number                         // % da altura da pagina (top-left)
  w_pct: number
  h_pct: number
  font_size: number                     // points
  font_weight: 'normal' | 'bold'
  font_family: 'Helvetica' | 'Times' | 'Courier'
  text_align: 'left' | 'center' | 'right'
  color?: string                        // hex, default '#000000'
}

export interface PageDimensionsRecord {
  width_pt: number
  height_pt: number
}

export interface DocumentTemplate {
  id: string
  clinic_id: string
  name: string
  type: TemplateType
  file_url?: string | null
  extracted_fields: ExtractedField[]
  template_html?: string | null
  page_images?: string[] | null         // Base64 data URLs das paginas do documento original
  // Pixel Perfect (migration 0138)
  original_pdf_path?: string | null     // path no bucket document-templates
  original_pdf_size_bytes?: number | null
  page_count?: number | null
  page_dimensions?: PageDimensionsRecord[] | null
  layout_overlays?: LayoutOverlay[] | null
  page_images_storage_paths?: string[] | null
  created_at: string
  updated_at?: string
}

// ── Invitations ──────────────────────────────────────────────────────────────

export type InvitationRole = 'vet' | 'assistant' | 'receptionist' | 'pharmacist'

export interface Invitation {
  id: string
  clinic_id: string
  email: string
  role: InvitationRole
  token: string
  invited_by: string
  accepted_at: string | null
  expires_at: string
  created_at: string
}

export interface SaveTemplatePayload {
  name: string
  type: TemplateType
  extracted_fields: ExtractedField[]
  template_html?: string | null
  page_images?: string[] | null
  // Pixel Perfect (migration 0138)
  original_pdf_path?: string | null
  original_pdf_size_bytes?: number | null
  page_count?: number | null
  page_dimensions?: PageDimensionsRecord[] | null
  layout_overlays?: LayoutOverlay[] | null
}
