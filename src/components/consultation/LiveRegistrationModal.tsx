'use client'

import { useState } from 'react'
import type { ExtractedData, ExtractedVaccine } from '@/lib/actions/ai_extraction'

interface Props {
  extractedData: ExtractedData
  onSave: (approved: { vaccines: ExtractedVaccine[]; behavior: string[] }) => void
  onClose: () => void
}

export function LiveRegistrationModal({ extractedData, onSave, onClose }: Props) {
  const [selectedVaccines, setSelectedVaccines] = useState<Set<number>>(
    () => new Set(extractedData.vaccines.map((_, i) => i))
  )
  const [selectedBehaviors, setSelectedBehaviors] = useState<Set<number>>(
    () => new Set(extractedData.behavior.map((_, i) => i))
  )

  function toggleVaccine(index: number) {
    setSelectedVaccines(prev => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }

  function toggleBehavior(index: number) {
    setSelectedBehaviors(prev => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }

  function handleSave() {
    onSave({
      vaccines: extractedData.vaccines.filter((_, i) => selectedVaccines.has(i)),
      behavior: extractedData.behavior.filter((_, i) => selectedBehaviors.has(i)),
    })
  }

  const hasSelection = selectedVaccines.size > 0 || selectedBehaviors.size > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 animate-scale-in">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-slate-200">
          <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.344.346a3.001 3.001 0 01-2.121.879H9.75a3 3 0 01-2.121-.879l-.344-.346z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">NOVAS INFORMAÇÕES FORAM ENCONTRADAS! DESEJA ATUALIZAR O CADASTRO DO PET/TUTOR COM ESSES DADOS?</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Vacinas */}
          {extractedData.vaccines.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Vacinas</h3>
              <ul className="space-y-2">
                {extractedData.vaccines.map((v, i) => (
                  <li key={i}>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-teal-300 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedVaccines.has(i)}
                        onChange={() => toggleVaccine(i)}
                        className="w-4 h-4 accent-teal-600"
                      />
                      <span className="text-sm text-slate-800 font-medium">{v.name}</span>
                      <span className="ml-auto text-xs text-slate-500">{v.date}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Comportamento */}
          {extractedData.behavior.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Comportamento</h3>
              <ul className="space-y-2">
                {extractedData.behavior.map((b, i) => (
                  <li key={i}>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-teal-300 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedBehaviors.has(i)}
                        onChange={() => toggleBehavior(i)}
                        className="w-4 h-4 accent-teal-600"
                      />
                      <span className="text-sm text-slate-800">{b}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Disclaimer IA */}
          <p className="text-xs text-slate-400 italic">
            * Sugestão gerada por IA. Revisão obrigatória pelo Médico Veterinário antes de salvar no prontuário.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!hasSelection}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Salvar no Prontuário
          </button>
        </div>
      </div>
    </div>
  )
}
