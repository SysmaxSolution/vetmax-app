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

export const SERVICE_CATEGORIES: StockCategory[] = ['service', 'exam']

export const PRODUCT_CATEGORIES: StockCategory[] = [
  'medication', 'controlled_medication', 'clinic_product',
  'petshop', 'grooming_supply', 'aesthetics', 'other',
]
