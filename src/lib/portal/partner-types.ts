// Tipos de view do Portal do Parceiro. Módulo puro (sem 'use server').

export interface PartnerProfessional {
  id: string
  name: string
  crmv: string | null
  email: string | null
  phone: string | null
  isActive: boolean
  hasCode: boolean
}

export interface PartnerReferredPet {
  id: string
  name: string
  species: string | null
  tutorName: string | null
  imagingCount: number
}

export interface PartnerPetImaging {
  id: string
  title: string | null
  modality: string | null
  laudoAvailable: boolean
  link: string | null
  createdAt: string
}
