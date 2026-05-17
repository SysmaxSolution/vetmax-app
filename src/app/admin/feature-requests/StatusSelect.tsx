'use client'

import { useTransition } from 'react'
import { updateFeatureGroupStatus } from '@/lib/actions/feature-requests'
import { useRouter } from 'next/navigation'

const STATUS_LABELS: Record<string, string> = {
  pending:     'Pendente',
  planned:     'Planejado',
  in_progress: 'Em andamento',
  done:        'Concluído',
}

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-slate-100 text-slate-700',
  planned:     'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done:        'bg-emerald-100 text-emerald-700',
}

interface Props {
  featureName: string
  currentStatus: string
}

export function StatusSelect({ featureName, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as 'pending' | 'planned' | 'in_progress' | 'done'
    startTransition(async () => {
      await updateFeatureGroupStatus(featureName, next)
      router.refresh()
    })
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      disabled={isPending}
      className={`rounded-full border-0 px-3 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60 cursor-pointer ${STATUS_COLORS[currentStatus] ?? STATUS_COLORS.pending}`}
    >
      {Object.entries(STATUS_LABELS).map(([val, label]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  )
}
