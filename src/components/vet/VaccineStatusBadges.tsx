'use client'

import type { PatientVaccine } from '@/lib/actions/vaccines'

function isOverdue(date: string | null): boolean {
  if (!date) return false
  return new Date(date) < new Date()
}

interface Props {
  vaccines: PatientVaccine[]
  className?: string
}

export default function VaccineStatusBadges({ vaccines, className = '' }: Props) {
  if (vaccines.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {vaccines.map(v => {
        const overdue = isOverdue(v.next_due_date)
        return (
          <span
            key={v.id}
            title={v.next_due_date ? `Próxima dose: ${v.next_due_date.split('-').reverse().join('/')}` : 'Sem próxima dose registrada'}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border cursor-default ${
              overdue
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${overdue ? 'bg-red-500' : 'bg-emerald-500'}`} />
            {v.vaccine_name}: {overdue ? 'Atrasada' : 'Em dia'}
          </span>
        )
      })}
    </div>
  )
}
