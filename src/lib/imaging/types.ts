// Tipos compartilhados do módulo de imagem. Módulo PURO (sem 'use server') —
// arquivos 'use server' só podem exportar funções async, então os tipos vivem aqui.
import type { StudyStatus } from '@/lib/imaging/study-status'

export interface ImagingStudyRow {
  id: string
  patient_id: string
  patient_name: string | null
  os_number: string | null
  modality: string | null
  title: string | null
  referring_vet_name: string | null
  referring_vet_email: string | null
  status: StudyStatus
  images_uploaded_at: string | null
  laudo_released_at: string | null
  released_to_tutor_at: string | null
  file_count: number
  created_at: string
}

export interface CreateStudyInput {
  patientId: string
  consultationId?: string | null
  examRequestId?: string | null
  modality?: string | null
  title?: string | null
  notes?: string | null
  referringVetName?: string | null
  referringVetEmail?: string | null
  referringVetCrmv?: string | null
  partnerClinicId?: string | null
  catalogItemId?: string | null    // serviço do catálogo (define publish_to_portal)
  referringProfessionalId?: string | null  // MV da clínica parceira que encaminhou
}

export interface PublicStudyFile { name: string; kind: string; url: string; contentType: string | null }

export interface PublicStudyView {
  petName: string
  clinicName: string
  clinicPhone: string | null
  modality: string | null
  title: string | null
  referringVetName: string | null
  audience: 'referring_vet' | 'tutor'
  status: StudyStatus
  images: PublicStudyFile[]
  laudoUrl: string | null
  laudoAvailable: boolean
  createdAt: string
}

export interface StaffStudyDetail extends ImagingStudyRow {
  notes: string | null
  referring_vet_crmv: string | null
  laudo_document_id: string | null
  files: PublicStudyFile[]
  links: { id: string; audience: string; token: string; url: string; revoked: boolean; views: number; expires_at: string | null }[]
}
