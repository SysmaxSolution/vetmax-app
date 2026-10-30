// Tipos de `src/lib/actions/appointment-slots.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export type BookedRange = { start: string; end: string } // 'HH:MM'

export type SlotInfo = {
  bookedTimes:     string[]
  bookedRanges:    BookedRange[]
  intervalMinutes: number
}
