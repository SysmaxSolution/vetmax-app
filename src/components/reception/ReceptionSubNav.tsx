'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutList, CalendarDays } from 'lucide-react'

export default function ReceptionSubNav() {
  const pathname = usePathname()

  const tabs = [
    { label: 'Atendimento', href: '/dashboard/reception',          icon: LayoutList   },
    { label: 'Agenda',      href: '/dashboard/reception/calendar', icon: CalendarDays },
  ]

  return (
    <div className="flex gap-1 mb-6">
      {tabs.map(tab => {
        const active = tab.href === '/dashboard/reception'
          ? !pathname.startsWith('/dashboard/reception/calendar')
          : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              active
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
