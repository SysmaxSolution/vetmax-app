// Constantes de categorias de estoque — sem 'use server' para uso em Client Components

export type StockCategory =
  | 'medication'
  | 'controlled_medication'
  | 'clinic_product'
  | 'petshop'
  | 'grooming_supply'
  | 'aesthetics'
  | 'other'
  | 'service'
  | 'exam'
  | 'vet_service'
  | 'grooming_service'
  | 'aesthetics_service'
  | 'surgery'

export const SERVICE_CATEGORIES: StockCategory[] = [
  'service', 'exam', 'vet_service', 'grooming_service', 'aesthetics_service', 'surgery',
]

export const PRODUCT_CATEGORIES: StockCategory[] = [
  'medication', 'controlled_medication', 'clinic_product',
  'petshop', 'grooming_supply', 'aesthetics', 'other',
]

// Categorias de serviço relevantes por motivo de consulta (para filtrar serviços na agenda)
export const REASON_SERVICE_CATEGORIES: Partial<Record<string, StockCategory[]>> = {
  consultation: ['vet_service', 'service'],
  follow_up:    ['vet_service', 'service'],
  emergency:    ['vet_service', 'surgery', 'service'],
  vaccination:  ['vet_service', 'service'],
  exam:         ['exam', 'service'],
  surgery:      ['surgery', 'vet_service', 'service'],
  grooming:     ['grooming_service', 'aesthetics_service'],
}
