'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, AlertCircle } from 'lucide-react'
import type { UserClinicInfo } from '@/lib/actions/clinic-switcher'
import { switchClinic } from '@/lib/actions/clinic-switcher'

interface ClinicSwitcherProps {
  currentClinicId: string
  clinicName:      string
  clinics:         UserClinicInfo[]
  logoUrl?:        string | null
}

export function ClinicSwitcher({ currentClinicId, clinicName, clinics, logoUrl }: ClinicSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSwitch(clinicId: string) {
    if (clinicId === currentClinicId) { setOpen(false); return }
    setSwitching(clinicId)
    setSwitchError(null)
    const res = await switchClinic(clinicId)
    if ('error' in res) {
      setSwitching(null)
      setSwitchError(res.error)
      return
    }
    // Hard navigation garante re-execução completa dos Server Components com os novos dados de perfil
    window.location.href = '/dashboard'
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      {logoUrl ? (
        <img src={logoUrl} alt={clinicName} className="h-8 w-auto max-w-[120px] object-contain rounded" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <span className="text-sm font-bold text-white">V</span>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-left group"
      >
        <div>
          {!logoUrl && <h1 className="text-sm font-semibold text-slate-900">SysVetMax</h1>}
          <p className="text-xs text-slate-500 group-hover:text-teal-600 transition-colors">{clinicName}</p>
        </div>
        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-[60]">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Suas Clínicas</p>
          {switchError && (
            <div className="mx-3 mb-1 flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {switchError}
            </div>
          )}
          {clinics.map((clinic) => {
            const isCurrent = clinic.id === currentClinicId
            const isLoading = switching === clinic.id
            return (
              <button
                key={clinic.id}
                onClick={() => handleSwitch(clinic.id)}
                disabled={switching !== null}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                  isCurrent
                    ? 'bg-teal-50 text-teal-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                  isLoading ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {isLoading
                    ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                    : clinic.name.charAt(0).toUpperCase()
                  }
                </div>
                <span className="flex-1 truncate">{clinic.name}</span>
                {isCurrent && !isLoading && <Check className="h-3.5 w-3.5 text-teal-600" />}
                {isLoading && <span className="text-[10px] text-teal-600 font-medium">Acessando…</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
