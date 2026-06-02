'use client'

import { useState } from 'react'
import { X, TestTubes, Loader2 } from 'lucide-react'
import { requestExam } from '@/lib/actions/exams'

const EXAM_TYPES = [
  { value: 'hemograma',       label: 'Hemograma Completo' },
  { value: 'bioquimico',      label: 'Perfil Bioquímico' },
  { value: 'urinanalise',     label: 'Urinálise' },
  { value: 'coproparasitologico', label: 'Coproparasitológico' },
  { value: 'ultrassom',       label: 'Ultrassom' },
  { value: 'raio_x',          label: 'Raio-X' },
  { value: 'eletrocardiograma', label: 'Eletrocardiograma (ECG)' },
  { value: 'citologia',       label: 'Citologia' },
  { value: 'cultura',         label: 'Cultura e Antibiograma' },
  { value: 'teste_rapido',    label: 'Teste Rápido (FIV/FeLV/4DX)' },
  { value: 'outro',           label: 'Outro' },
]

interface ExamRequestModalProps {
  patientId:    string
  patientName:  string
  tutorId:      string
  /**
   * Quando vier, a solicitação NÃO cria consulta nova — transiciona a consulta
   * atual do MV para waiting_exam e vincula o exam_request. Caller típico:
   * Consultório, onde o exame faz parte do atendimento em curso.
   */
  consultationId?: string
  onClose:      () => void
  onSuccess?:   (examId: string) => void
}

export default function ExamRequestModal({
  patientId,
  patientName,
  tutorId,
  consultationId,
  onClose,
  onSuccess,
}: ExamRequestModalProps) {
  const [examType, setExamType] = useState('')
  const [customType, setCustomType] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finalExamType = examType === 'outro' ? customType.trim() : examType

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!finalExamType) {
      setError('Selecione o tipo de exame.')
      return
    }

    setSaving(true)
    setError(null)

    const result = await requestExam({
      patient_id:      patientId,
      tutor_id:        tutorId,
      exam_type:       finalExamType,
      notes:           notes.trim() || undefined,
      consultation_id: consultationId,
    })

    setSaving(false)

    if ('error' in result) {
      setError(result.error)
    } else {
      onSuccess?.(result.id)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <TestTubes className="h-5 w-5 text-purple-600" />
            <h2 className="text-base font-semibold text-slate-900">Solicitar Exame</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Paciente: <span className="font-semibold text-slate-900">{patientName}</span>
          </p>

          {/* Exam type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de Exame</label>
            <select
              value={examType}
              onChange={e => setExamType(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="">Selecione...</option>
              {EXAM_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {examType === 'outro' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Especifique</label>
              <input
                type="text"
                value={customType}
                onChange={e => setCustomType(e.target.value)}
                placeholder="Nome do exame"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Observações (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Instruções ou informações adicionais..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 resize-none focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !finalExamType}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTubes className="h-4 w-4" />}
              {saving ? 'Solicitando...' : 'Solicitar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
