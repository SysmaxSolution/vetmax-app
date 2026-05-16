import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUnifiedEventsForRange } from '@/lib/actions/calendar'
import AppointmentsCalendar from '@/components/appointments/AppointmentsCalendar'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { CalendarDays } from 'lucide-react'

export const metadata = { title: 'Agenda' }

export default async function AppointmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date()
  const start = format(startOfMonth(today), 'yyyy-MM-dd')
  const end   = format(endOfMonth(today),   'yyyy-MM-dd')

  const result = await getUnifiedEventsForRange(start, end)
  const initialEvents = Array.isArray(result) ? result : []

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-blue-600" />
              Agenda
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Consultas e sessões de Banho & Tosa — visão Mês, Semana e Dia
            </p>
          </div>
        </div>

        <AppointmentsCalendar
          initialEvents={initialEvents}
          initialDate={today}
        />
      </main>
    </div>
  )
}
