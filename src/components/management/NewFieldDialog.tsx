'use client'

/**
 * Dialog que aparece apos o usuario desenhar um retangulo sobre o PDF
 * em modo "Desenhar Campo". Coleta field_name, label, type e required
 * e devolve um ExtractedField completo para ser adicionado ao template.
 */

import { useState, useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import type { ExtractedField, FieldType } from '@/types'

interface NewFieldDialogProps {
  // Coordenadas do retangulo desenhado em %
  rect: { x_pct: number; y_pct: number; w_pct: number; h_pct: number }
  page: number
  onConfirm: (field: ExtractedField) => void
  onCancel: () => void
  // Lista de fields ja existentes para validar duplicidade de field_name
  existingFieldNames: string[]
}

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number',   label: 'Numero' },
  { value: 'date',     label: 'Data' },
  { value: 'boolean',  label: 'Sim/Nao' },
  { value: 'select',   label: 'Selecao' },
]

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .slice(0, 64)
}

export default function NewFieldDialog({
  rect, page, onConfirm, onCancel, existingFieldNames,
}: NewFieldDialogProps) {
  const [label, setLabel] = useState('')
  const [fieldName, setFieldName] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const [required, setRequired] = useState(false)
  const [fieldNameTouched, setFieldNameTouched] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)

  // Auto-foca o primeiro input ao abrir
  useEffect(() => { labelRef.current?.focus() }, [])

  // Auto-deriva field_name a partir do label enquanto o usuario nao toca nele
  useEffect(() => {
    if (!fieldNameTouched) setFieldName(slugify(label))
  }, [label, fieldNameTouched])

  // Esc cancela
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const isDuplicate = fieldName.length > 0 && existingFieldNames.includes(fieldName)
  const isValid = label.trim().length > 0 && fieldName.length > 0 && !isDuplicate

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    const field: ExtractedField = {
      field_name: fieldName,
      label: label.trim(),
      type,
      description: label.trim(),  // default: igual ao label; usuario pode editar depois
      required,
      x_percent: rect.x_pct,
      y_percent: rect.y_pct,
      width_percent: rect.w_pct,
      height_percent: rect.h_pct,
      page,
    }
    onConfirm(field)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Novo campo</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Pagina {page + 1} &middot; X:{rect.x_pct.toFixed(1)}% Y:{rect.y_pct.toFixed(1)}%
              {' '}({rect.w_pct.toFixed(1)}% &times; {rect.h_pct.toFixed(1)}%)
            </p>
          </div>
          <button type="button" onClick={onCancel}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-700">
              Label <span className="text-red-500">*</span>
            </label>
            <input
              ref={labelRef}
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="ex: Diametro Sistolico"
              className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Como o campo aparecera no preenchimento. Aparece tambem no PDF gerado se mantido.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">
              Nome tecnico (field_name) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fieldName}
              onChange={e => { setFieldName(slugify(e.target.value)); setFieldNameTouched(true) }}
              placeholder="ex: diametro_sistolico"
              className={
                'mt-1 w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 ' +
                (isDuplicate ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-500')
              }
            />
            {isDuplicate ? (
              <p className="text-[10px] text-red-600 mt-1">Ja existe um campo com esse nome no template.</p>
            ) : (
              <p className="text-[10px] text-slate-400 mt-1">
                snake_case, usado como variavel no PDF gerado ({'{{'}{fieldName || 'campo'}{'}}'})
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Tipo</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as FieldType)}
                className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 px-3 py-2 w-full border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={e => setRequired(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-xs text-slate-700">Obrigatorio</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!isValid}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Adicionar campo
          </button>
        </div>
      </form>
    </div>
  )
}
