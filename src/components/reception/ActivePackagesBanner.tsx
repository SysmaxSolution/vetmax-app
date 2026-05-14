'use client'

import { useState, useEffect, useTransition } from 'react'
import { Gift, Loader2, ChevronDown, ChevronUp, Check, X, User, Calendar } from 'lucide-react'
import { getPetActivePackages, schedulePackageSession, type PatientActivePackage } from '@/lib/actions/packages'
import { getClinicProfessionals, type ClinicProfessional } from '@/lib/actions/professionals'

interface Props {
  petId:   string
  petName: string
}

function nowLocal() {
  const d = new Date()
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

export default function ActivePackagesBanner({ petId, petName }: Props) {
  const [packages,  setPackages]  = useState<PatientActivePackage[]>([])
  const [loading,   setLoading]   = useState(true)
  const [expanded,  setExpanded]  = useState(false)
  const [sessionModal, setSessionModal] = useState<PatientActivePackage | null>(null)

  useEffect(() => {
    setLoading(true)
    getPetActivePackages(petId).then(res => {
      setLoading(false)
      if (Array.isArray(res)) setPackages(res)
    })
  }, [petId])

  function handleUsed(papId: string) {
    setPackages(prev => prev
      .map(p => {
        if (p.id !== papId) return p
        const remaining = (p.sessions_remaining ?? 1) - 1
        if (remaining <= 0) return { ...p, status: 'completed' as const, sessions_remaining: 0 }
        return { ...p, sessions_remaining: remaining }
      })
      .filter(p => p.status === 'active')
    )
    setSessionModal(null)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando pacotes...
    </div>
  )

  if (packages.length === 0) return null

  const totalRemaining = packages.reduce((s, p) => s + (p.sessions_remaining ?? 0), 0)

  return (
    <>
      <div className="rounded-xl border-2 border-teal-400 bg-teal-50 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-teal-100/50 transition-colors"
        >
          <Gift className="h-5 w-5 text-teal-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-teal-800">
              Pacotes Ativos — Restam {totalRemaining} sessão{totalRemaining !== 1 ? 'ões' : ''}
            </p>
            <p className="text-xs text-teal-600 truncate">
              {packages.map(p => p.package?.name ?? '—').join(', ')}
            </p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-teal-500" /> : <ChevronDown className="h-4 w-4 text-teal-500" />}
        </button>

        {expanded && (
          <div className="border-t border-teal-200 divide-y divide-teal-100">
            {packages.map(pap => (
              <div key={pap.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {pap.package?.name ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {pap.sessions_remaining} de {pap.sessions_total} sessão{(pap.sessions_total ?? 0) !== 1 ? 'ões' : ''} restante{(pap.sessions_remaining ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSessionModal(pap)}
                  disabled={(pap.sessions_remaining ?? 0) === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-colors disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" />
                  Usar sessão
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {sessionModal && (
        <UseSessionModal
          pap={sessionModal}
          petName={petName}
          onClose={() => setSessionModal(null)}
          onSuccess={() => handleUsed(sessionModal.id)}
        />
      )}
    </>
  )
}

// ─── Modal de Uso de Sessão ───────────────────────────────────────────────────

function UseSessionModal({ pap, petName, onClose, onSuccess }: {
  pap:       PatientActivePackage
  petName:   string
  onClose:   () => void
  onSuccess: () => void
}) {
  const [dateTime,       setDateTime]       = useState(nowLocal())
  const [professionalId, setProfessionalId] = useState(pap.package?.default_professional_id ?? '')
  const [professionals,  setProfessionals]  = useState<ClinicProfessional[]>([])
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [, startTx]                         = useTransition()

  useEffect(() => {
    getClinicProfessionals().then(res => {
      if (!('error' in res)) {
        setProfessionals(res)
        if (!professionalId && res.length > 0) setProfessionalId(res[0].id)
      }
    })
  }, [])

  async function handleConfirm() {
    setSaving(true)
    setError('')
    const res = await schedulePackageSession({
      patient_active_package_id: pap.id,
      scheduled_for:             new Date(dateTime).toISOString(),
    })
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    onSuccess()
  }

  const remaining = pap.sessions_remaining ?? 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-teal-600" />
            <h3 className="font-semibold text-slate-900">Usar Sessão do Pacote</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-teal-50 rounded-xl p-3">
            <p className="text-sm font-semibold text-teal-800">{pap.package?.name ?? '—'}</p>
            <p className="text-xs text-teal-600 mt-0.5">
              {petName} · {remaining - 1 < 0 ? 0 : remaining - 1} sessões restantes após este uso
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
              <Calendar className="h-3.5 w-3.5" /> Data e Hora
            </label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={e => setDateTime(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="button"
              onClick={() => setDateTime(nowLocal())}
              className="mt-1 text-xs text-teal-600 hover:underline"
            >
              Usar agora
            </button>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
              <User className="h-3.5 w-3.5" /> Profissional
            </label>
            <select
              value={professionalId}
              onChange={e => setProfessionalId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="">Não informado</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 bg-teal-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Confirmar Sessão
          </button>
        </div>
      </div>
    </div>
  )
}
