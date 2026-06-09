'use client'

import { useState } from 'react'
import { Zap, X, Loader2, Save, CalendarDays } from 'lucide-react'
import { registerTutorAndPet } from '@/lib/actions/tutors'
import type { PatientSpecies } from '@/types'

/**
 * Modal de cadastro RÁPIDO para a Recepção.
 *
 * Diferente do PatientFullModal (que tem 5 abas e dezenas de campos),
 * este formulário pede apenas o mínimo para emitir um agendamento:
 *   - Nome do pet (obrigatório)
 *   - Espécie
 *   - Nome do tutor
 *   - Telefone
 *
 * Ao salvar, devolve via onSuccess os IDs e nomes — a Recepção pode então
 * abrir o NewAppointmentModal com defaultPet preenchido, fechando o ciclo
 * "atender o cliente que chegou agora sem cadastro completo".
 */

const SPECIES_OPTIONS: { value: PatientSpecies; label: string; emoji: string }[] = [
  { value: 'dog',     label: 'Cão',       emoji: '🐶' },
  { value: 'cat',     label: 'Gato',      emoji: '🐱' },
  { value: 'bird',    label: 'Ave',       emoji: '🐦' },
  { value: 'rabbit',  label: 'Coelho',    emoji: '🐰' },
  { value: 'rodent',  label: 'Roedor',    emoji: '🐹' },
  { value: 'reptile', label: 'Réptil',    emoji: '🦎' },
  { value: 'fish',    label: 'Peixe',     emoji: '🐟' },
  { value: 'exotic',  label: 'Silvestre', emoji: '🦜' },
]

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2)  return d
  if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

interface QuickResult {
  tutorId:     string
  tutorName:   string
  patientId:   string
  patientName: string
  petSpecies:  PatientSpecies
  /** Indica se o usuário pediu para abrir o NewAppointmentModal logo após salvar. */
  scheduleAfter: boolean
}

interface Props {
  onClose:        () => void
  onSuccess:      (r: QuickResult) => void
  /** Quando true, o botão extra "Salvar e Agendar" aparece. */
  showScheduleCta?: boolean
}

export default function QuickPetRegisterModal({ onClose, onSuccess, showScheduleCta = true }: Props) {
  const [petName,    setPetName]    = useState('')
  const [species,    setSpecies]    = useState<PatientSpecies>('dog')
  const [tutorName,  setTutorName]  = useState('')
  const [phone,      setPhone]      = useState('')
  const [saving,     setSaving]     = useState<'register' | 'register_and_schedule' | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  async function handleSave(then: 'close' | 'schedule') {
    setError(null)
    if (!petName.trim())   { setError('Informe o nome do pet.'); return }
    if (!tutorName.trim()) { setError('Informe o nome do tutor.'); return }

    setSaving(then === 'schedule' ? 'register_and_schedule' : 'register')
    const res = await registerTutorAndPet(
      {
        name:   tutorName.trim(),
        phone:  phone.replace(/\D/g, '') || undefined,
      },
      {
        name:    petName.trim(),
        species,
      },
    )
    setSaving(null)
    if ('error' in res) { setError(res.error); return }
    onSuccess({
      tutorId:       res.tutorId,
      patientId:     res.patientId,
      tutorName:     tutorName.trim(),
      patientName:   petName.trim(),
      petSpecies:    species,
      scheduleAfter: then === 'schedule',
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-amber-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Cadastro Rápido</h2>
              <p className="text-[11px] text-slate-500">Dados mínimos — agende agora, complete o cadastro depois</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Nome do Pet <span className="text-rose-500">*</span>
            </label>
            <input
              autoFocus
              value={petName}
              onChange={e => setPetName(e.target.value)}
              placeholder="Ex: Thor, Luna, Mel..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Espécie</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {SPECIES_OPTIONS.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSpecies(s.value)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 transition-colors ${
                    species === s.value
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-slate-200 bg-white hover:border-amber-300'
                  }`}
                >
                  <span className="text-base leading-none">{s.emoji}</span>
                  <span className="text-[10px] font-semibold text-slate-700">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Nome do Tutor <span className="text-rose-500">*</span>
            </label>
            <input
              value={tutorName}
              onChange={e => setTutorName(e.target.value)}
              placeholder="Ex: Maria Silva"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Telefone (opcional)</label>
            <input
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="(11) 99999-0000"
              inputMode="numeric"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            CPF, endereço e dados clínicos podem ser completados depois em <strong>Pacientes → Editar Cadastro</strong>.
          </p>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!!saving}
            onClick={() => handleSave('close')}
            className="flex-1 rounded-xl bg-slate-700 hover:bg-slate-800 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving === 'register'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              : <><Save className="h-4 w-4" /> Salvar</>}
          </button>
          {showScheduleCta && (
            <button
              type="button"
              disabled={!!saving}
              onClick={() => handleSave('schedule')}
              className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              title="Cadastra e abre o modal de agendamento já com o pet selecionado"
            >
              {saving === 'register_and_schedule'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                : <><CalendarDays className="h-4 w-4" /> Salvar e Agendar</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
