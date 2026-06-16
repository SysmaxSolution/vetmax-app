'use client'

import { X, User, PawPrint, Calendar, Weight, Clock } from 'lucide-react'
import type { ClinicalContext } from '@/types/whatsapp'

interface Props {
  context: ClinicalContext | null
  loading: boolean
  isOpen: boolean
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function speciesLabel(species: string): string {
  const map: Record<string, string> = {
    dog: 'Cão',
    cat: 'Gato',
    bird: 'Ave',
    rabbit: 'Coelho',
    hamster: 'Hamster',
    reptile: 'Réptil',
    fish: 'Peixe',
    other: 'Outro',
  }
  return map[species.toLowerCase()] ?? species
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 p-4 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-100 rounded w-1/2" />
      <div className="h-3 bg-slate-100 rounded w-2/3" />
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClinicalContextPanel({ context, loading, isOpen, onClose }: Props) {
  if (!isOpen) return null

  return (
    <div
      className="absolute right-0 top-0 z-30 flex flex-col bg-white border border-slate-200 rounded-xl shadow-lg"
      style={{ width: 280 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-700">Contexto Clínico</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Fechar painel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <Skeleton />
      ) : !context || !context.tutor ? (
        <div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
          <User size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">Tutor não encontrado no sistema</p>
        </div>
      ) : (
        <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
          {/* Tutor */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <User size={14} className="text-slate-400 shrink-0" />
            <span className="text-sm font-medium text-slate-800 truncate">
              {context.tutor.name ?? 'Tutor sem nome'}
            </span>
          </div>

          {/* Pets */}
          {context.patients.length === 0 ? (
            <p className="px-3 pb-3 text-xs text-slate-400">Nenhum pet cadastrado</p>
          ) : (
            <ul className="divide-y divide-slate-50 pb-2">
              {context.patients.map((pet) => (
                <li key={pet.id} className="px-3 py-2 space-y-1">
                  {/* Pet name + species */}
                  <div className="flex items-center gap-1.5">
                    <PawPrint size={13} className="text-teal-600 shrink-0" />
                    <span className="text-sm font-semibold text-teal-700 truncate">
                      {pet.name}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      · {speciesLabel(pet.species)}
                      {pet.breed ? ` (${pet.breed})` : ''}
                    </span>
                  </div>

                  {/* Last weight */}
                  {pet.last_weight !== null && (
                    <div className="flex items-center gap-1 pl-0.5">
                      <Weight size={11} className="text-slate-400" />
                      <span className="text-xs text-slate-500">
                        {pet.last_weight.toFixed(1)} kg
                      </span>
                    </div>
                  )}

                  {/* Last consultation */}
                  {pet.last_consultation && (
                    <div className="flex items-start gap-1 pl-0.5">
                      <Calendar size={11} className="text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs text-slate-500">
                          Últ. consulta: {fmtDate(pet.last_consultation.date)}
                        </span>
                        <br />
                        <span className="text-xs text-slate-700">
                          {pet.last_consultation.visit_reason}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Upcoming consultation */}
                  {pet.upcoming_consultation && (
                    <div className="flex items-start gap-1 pl-0.5">
                      <Clock size={11} className="text-teal-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs text-teal-600 font-medium">
                          Próx: {fmtDate(pet.upcoming_consultation.date)}
                        </span>
                        <br />
                        <span className="text-xs text-slate-700">
                          {pet.upcoming_consultation.visit_reason}
                        </span>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
