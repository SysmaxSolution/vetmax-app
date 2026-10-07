// Tipos de view do Portal do Tutor. Módulo puro (sem 'use server').

export type PortalBookingMode = 'off' | 'reception' | 'direct'

export interface PortalBookingService { id: string; name: string; durationMinutes: number | null }

export interface PortalBookingOptions {
  mode: PortalBookingMode
  petName: string
  vets: { id: string; name: string }[]
  suggestedVetId: string | null
  services: PortalBookingService[]
}

export interface SubmitBookingInput {
  petId: string
  vetId?: string | null
  reason?: string | null
  serviceId?: string | null
  date: string
  time: string
  altDate?: string | null
  altTime?: string | null
}

export interface PortalPet {
  id: string
  name: string
  species: string | null
  photoUrl: string | null
  clinicId: string
  clinicName: string
}

export interface PortalVaccine {
  id: string
  vaccineName: string
  dateAdministered: string
  nextDueDate: string | null
  vetName: string | null
}

export interface PortalExamResult {
  panel: string | null
  analyteName: string
  value: string
  unit: string | null
  refText: string | null
  flag: string | null
  releasedAt: string | null
}

export interface PortalImaging {
  id: string
  title: string | null
  modality: string | null
  laudoAvailable: boolean
  link: string | null            // /public/laudo/<tutor-token>
  createdAt: string
}

export interface PortalDocument {
  id: string
  name: string
  url: string                    // signed url
  createdAt: string
}

export interface PortalTrend {
  analyte: string
  unit: string | null
  points: { date: string; value: number; flag: string | null }[]
}

export type PortalTimelineType = 'consulta' | 'exame' | 'imagem' | 'vacina' | 'receita' | 'documento'
export interface PortalTimelineEvent {
  date: string           // ISO ou YYYY-MM-DD
  type: PortalTimelineType
  title: string
  subtitle: string | null
}

export interface PortalPrescription {
  id: string
  medication: string
  dose: string | null
  route: string | null
  form: string | null
  isControlled: boolean
  signedAt: string
}

export interface PortalPetDetail {
  id: string
  name: string
  species: string | null
  breed: string | null
  photoUrl: string | null
  clinicName: string
  clinicPhone: string | null
  /** Clínica DONA do pet — é o contexto de white-label desta tela. */
  clinicId: string
  /** Slug da clínica (`/portal/c/<slug>`); null se a clínica ainda não tem. */
  clinicSlug: string | null
  canBook: boolean
  vaccines: PortalVaccine[]
  exams: PortalExamResult[]
  imaging: PortalImaging[]
  documents: PortalDocument[]
  prescriptions: PortalPrescription[]
  trends: PortalTrend[]
  timeline: PortalTimelineEvent[]
  processing: PortalProcessing[]
}

/** Exame/imagem coletado, ainda em elaboração (visível ao tutor, sem valores). */
export interface PortalProcessing {
  id: string
  kind: 'exame' | 'imagem'
  title: string
  statusLabel: string
  requestedAt: string | null
}
