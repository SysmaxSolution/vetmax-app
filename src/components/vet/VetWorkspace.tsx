'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Clock, CheckCircle2, ArrowRight, Stethoscope, AlertCircle, Weight, Thermometer, History, Pencil } from 'lucide-react'
import type { VetQueueItem, VetCompletedItem } from '@/lib/actions/vet'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { BehaviorTagsBadges } from '@/components/ui/BehaviorTagsBadges'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPECIES_LABELS: Record<string, string> = {
  dog: 'Canino', cat: 'Felino', bird: 'Ave', rabbit: 'Coelho',
  rodent: 'Roedor', reptile: 'Réptil', fish: 'Peixe', exotic: 'Exótico',
}

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐱', bird: '🐦', rabbit: '🐰',
  rodent: '🐭', reptile: '🦎', fish: '🐠', exotic: '✨',
}

const VISIT_REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta', follow_up: 'Retorno', emergency: 'Emergência',
  vaccination: 'Vacinação', exam: 'Exame', surgery: 'Cirurgia',
}

const STATUS_BADGE: Record<string, string> = {
  in_progress:              'bg-indigo-100 text-indigo-700',
  waiting_exam:             'bg-orange-100 text-orange-700',
  medication:               'bg-pink-100 text-pink-700',
  completed:                'bg-green-100 text-green-700',
  revisao_pos_internacao:   'bg-violet-100 text-violet-700',
}

const STATUS_LABEL: Record<string, string> = {
  in_progress:              'Em Consulta',
  waiting_exam:             'Ag. Exame',
  medication:               'Em Medicação',
  completed:                'Concluída',
  revisao_pos_internacao:   'Análise Pós-Internação',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface VetWorkspaceProps {
  queue:     VetQueueItem[]
  completed: VetCompletedItem[]
  clinicId:  string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VetWorkspace({ queue, completed, clinicId }: VetWorkspaceProps) {
  useRealtimeSync({ table: 'consultations', clinicId })

  const [tab, setTab] = useState<'fila' | 'historico'>('fila')

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Consultório Veterinário</h1>
          <p className="mt-0.5 text-sm text-slate-500">Atendimento clínico e prontuário eletrônico</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
          <button
            type="button"
            onClick={() => setTab('fila')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              tab === 'fila'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Stethoscope className="h-4 w-4" />
            Fila de Espera
            {queue.length > 0 && (
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                tab === 'fila' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {queue.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('historico')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              tab === 'historico'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <History className="h-4 w-4" />
            Histórico de Hoje
            {completed.length > 0 && (
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                tab === 'historico' ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {completed.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Fila de Espera ───────────────────────────────────────────────── */}
        {tab === 'fila' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <Stethoscope className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Aguardando Atendimento</h2>
                  <p className="text-xs text-slate-500">Triagens prontas para consulta</p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                {queue.length} consulta{queue.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-600">Fila vazia!</p>
                  <p className="text-xs text-slate-400 mt-1">Nenhum animal aguardando atendimento</p>
                </div>
              ) : (
                queue.map((item) => (
                  <Link
                    key={item.id}
                    href={`/dashboard/vet/${item.id}`}
                    className="block p-5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900">{item.patient.name}</h3>
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {SPECIES_EMOJI[item.patient.species] ?? '🐾'} {SPECIES_LABELS[item.patient.species] ?? item.patient.species}
                          </span>
                          {item.visit_reason === 'emergency' && (
                            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                              🚨 Emergência
                            </span>
                          )}
                          {item.status === 'revisao_pos_internacao' && (
                            <span className="text-xs font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                              🏥 Análise Pós-Internação
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">
                          Tutor: <span className="font-medium text-slate-600">{item.tutor.name}</span>
                          {' · '}{VISIT_REASON_LABELS[item.visit_reason] ?? item.visit_reason}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {item.vital_signs?.weight && item.vital_signs.weight > 0 && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                              <Weight className="w-3 h-3" />
                              {item.vital_signs.weight} kg
                            </span>
                          )}
                          {item.vital_signs?.temperature && item.vital_signs.temperature > 0 && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                              <Thermometer className="w-3 h-3" />
                              {item.vital_signs.temperature}°C
                            </span>
                          )}
                          {item.vital_signs?.heart_rate && item.vital_signs.heart_rate > 0 && (
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              FC: {item.vital_signs.heart_rate} bpm
                            </span>
                          )}
                          {item.patient.allergies && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                              <AlertCircle className="w-3 h-3" />
                              Alérgico
                            </span>
                          )}
                          <BehaviorTagsBadges tags={item.patient.behavior_tags} size="xs" />
                        </div>
                        {item.vital_signs?.chief_complaint && (
                          <p className="text-xs text-slate-400 mt-1.5 italic line-clamp-1">
                            &ldquo;{item.vital_signs.chief_complaint}&rdquo;
                          </p>
                        )}
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Histórico de Hoje ─────────────────────────────────────────────── */}
        {tab === 'historico' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
                  <History className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Atendimentos Realizados Hoje</h2>
                  <p className="text-xs text-slate-500">Clique em "Editar" para reabrir o prontuário</p>
                </div>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">
                {completed.length} registro{completed.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {completed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Clock className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-500">Nenhum atendimento realizado ainda hoje</p>
                </div>
              ) : (
                completed.map((item) => (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg overflow-hidden">
                        {item.patient.photo_url
                          ? <img src={item.patient.photo_url} alt={item.patient.name} className="h-full w-full object-cover" />
                          : SPECIES_EMOJI[item.patient.species] ?? '🐾'}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900">{item.patient.name}</p>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[item.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {STATUS_LABEL[item.status] ?? item.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {SPECIES_LABELS[item.patient.species] ?? item.patient.species} · Tutor: {item.tutor.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {VISIT_REASON_LABELS[item.visit_reason] ?? item.visit_reason}
                        </p>
                      </div>
                    </div>

                    {/* Ação */}
                    <Link
                      href={`/dashboard/vet/${item.id}`}
                      className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors ml-[52px] sm:ml-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar Consulta
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
