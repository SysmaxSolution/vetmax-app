// Core Management Types

export type Category = 'grooming_supplies' | 'medications' | 'exams' | 'services' | 'other'

export type CashierModule = 'grooming' | 'pharmacy' | 'consultation' | 'exam' | 'manual' | 'adjustment'

export type CashierStatus = 'recorded' | 'verified' | 'archived' | 'reversed'

export type PaymentMethod = 'pix' | 'credit' | 'debit' | 'cash' | 'convenio' | 'other'

export type OutflowCategory = 'sangria' | 'despesa_operacional' | 'fornecedor' | 'estorno' | 'other'

export type CashierSessionStatus = 'open' | 'closed'

export interface CashierSession {
  id: string
  clinic_id: string
  opened_by: string
  opened_at: string
  closed_by?: string
  closed_at?: string
  opening_balance: number
  closing_balance?: number
  status: CashierSessionStatus
  notes?: string
}

export interface CashierOutflow {
  id: string
  clinic_id: string
  session_id?: string
  amount: number
  category: OutflowCategory
  description: string
  created_by: string
  created_at: string
}

export interface ClinicSettings {
  id: string
  clinic_id: string
  business_hours: Record<string, { open: string; close: string } | null>
  working_days: number[] // ISO weekday: 1=Mon, 7=Sun
  holiday_work: boolean
}

export interface CentralCashierEntry {
  id: string
  clinic_id: string
  source_module: CashierModule
  source_id?: string
  session_id?: string
  amount: number
  status: CashierStatus
  reason?: string
  payment_method?: PaymentMethod
  patient_name?: string
  tutor_name?: string
  reversal_reason?: string
  reversed_at?: string
  reversed_by?: string
  created_at: string
  recorded_by?: string
}

export interface CashierDailyReport {
  date: string
  total_amount: number
  entry_count: number
  by_module: Record<CashierModule, { amount: number; count: number }>
}

export interface SlotAvailability {
  date: string
  slots: string[] // HH:MM format
  open_time: string
  close_time: string
  is_working_day: boolean
}
