'use client'

import { useState } from 'react'
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, PawPrint, Syringe } from 'lucide-react'
import ReceptionSubNav from './ReceptionSubNav'
import type { VaccinationSchedule, VaccinationScheduleItem } from '@/lib/actions/reception-schedule'

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function ScheduleList({ items, tone }: { items: VaccinationScheduleItem[]; tone: 'rose' | 'emerald' }) {
  if (items.length === 0) {
    return <p className="px-5 py-4 text-sm text-slate-400">Nenhuma vacina nesta categoria.</p>
  }
  return (
    <div className="divide-y divide-slate-100">
      {items.map(it => (
        <div key={it.id} className="px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <PawPrint className="h-3.5 w-3.5 text-slate-400" /> {it.patient_name}
              <span className="text-xs font-normal text-slate-400">· {it.tutor_name ?? 'sem tutor'}</span>
            </p>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Syringe className="h-3 w-3 text-slate-300" /> {it.vaccine_name}
              <span className={tone === 'rose' ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>
                · {tone === 'rose' ? 'venceu em' : 'prevista p/'} {formatDate(it.next_due_date)}
              </span>
            </p>
          </div>
          {it.tutor_phone && (
            <a
              href={`https://wa.me/55${it.tutor_phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 hover:bg-green-100"
            >
              WhatsApp
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

export default function ProgramacoesWorkspace({ schedule }: { schedule: VaccinationSchedule }) {
  const [openOverdue, setOpenOverdue]   = useState(true)
  const [openUpcoming, setOpenUpcoming] = useState(false)

  return (
    <>
      <ReceptionSubNav />

      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Programações</h1>
          <p className="text-sm text-slate-500">Vacinas atrasadas e programadas dos pets da clínica.</p>
        </div>

        {/* Vacinas atrasadas */}
        <div className="rounded-2xl border border-rose-200 bg-white shadow-sm overflow-hidden">
          <button onClick={() => setOpenOverdue(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between bg-rose-50/60 hover:bg-rose-50">
            <span className="flex items-center gap-2 font-semibold text-rose-800">
              {openOverdue ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <AlertTriangle className="h-4 w-4" /> Vacinas atrasadas
            </span>
            <span className="text-lg font-bold text-rose-700 tabular-nums">{schedule.overdue.length}</span>
          </button>
          {openOverdue && <ScheduleList items={schedule.overdue} tone="rose" />}
        </div>

        {/* Vacinas programadas */}
        <div className="rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
          <button onClick={() => setOpenUpcoming(v => !v)}
            className="w-full px-5 py-4 flex items-center justify-between bg-emerald-50/60 hover:bg-emerald-50">
            <span className="flex items-center gap-2 font-semibold text-emerald-800">
              {openUpcoming ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <CalendarClock className="h-4 w-4" /> Vacinas programadas
            </span>
            <span className="text-lg font-bold text-emerald-700 tabular-nums">{schedule.upcoming.length}</span>
          </button>
          {openUpcoming && <ScheduleList items={schedule.upcoming} tone="emerald" />}
        </div>

        <p className="text-xs text-slate-400">
          O agendamento automático via bot do WhatsApp (tutor escolhe horário, recepção valida) entra numa próxima etapa.
        </p>
      </div>
    </>
  )
}
