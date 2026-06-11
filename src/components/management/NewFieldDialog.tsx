'use client'

/**
 * Dialog que aparece apos o usuario desenhar um retangulo sobre o PDF
 * em modo "Desenhar Campo". Dois modos:
 *
 *   1. Campo NOVO: coleta field_name + label + type + required → onConfirm
 *   2. Campo REPETIDO: quando o user digita um field_name que ja existe,
 *      o dialog detecta e oferece "Adicionar posicao extra" — isso cria
 *      apenas um LayoutOverlay novo, sem duplicar em extracted_fields.
 *      Util para cabecalhos, logos, assinaturas que aparecem em todas
 *      as paginas do laudo.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Plus, Copy, AlertCircle } from 'lucide-react'
import type { ExtractedField, FieldType } from '@/types'

interface NewFieldDialogProps {
  rect: { x_pct: number; y_pct: number; w_pct: number; h_pct: number }
  page: number
  // Lista COMPLETA de fields ja existentes (para validar duplicidade E para
  // exibir info quando o user repete um existente)
  existingFields: ExtractedField[]
  // Callback para campo NOVO (push em extracted_fields + cria LayoutElement)
  onConfirm: (field: ExtractedField) => void
  // Callback para campo REPETIDO (so cria LayoutElement, sem duplicar field)
  onConfirmRepeat: (existingFieldName: string) => void
  onCancel: () => void
}

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number',   label: 'Número' },
  { value: 'date',     label: 'Data' },
  { value: 'boolean',  label: 'Sim/Não' },
  { value: 'select',   label: 'Seleção' },
]

const TYPE_LABEL: Record<FieldType, string> = Object.fromEntries(
  TYPE_OPTIONS.map(o => [o.value, o.label]),
) as Record<FieldType, string>

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
  rect, page, existingFields, onConfirm, onConfirmRepeat, onCancel,
}: NewFieldDialogProps) {
  const [label, setLabel] = useState('')
  const [fieldName, setFieldName] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const [required, setRequired] = useState(false)
  const [fieldNameTouched, setFieldNameTouched] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)

  useEffect(() => { labelRef.current?.focus() }, [])

  useEffect(() => {
    if (!fieldNameTouched) setFieldName(slugify(label))
  }, [label, fieldNameTouched])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Detecta se o field_name digitado bate com um existente → modo "repetir"
  const existingMatch: ExtractedField | null = useMemo(() => {
    if (!fieldName) return null
    return existingFields.find(f => f.field_name === fieldName) ?? null
  }, [fieldName, existingFields])

  const isRepeatMode = existingMatch !== null
  const isValid = isRepeatMode
    ? true
    : (label.trim().length > 0 && fieldName.length > 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    if (isRepeatMode && existingMatch) {
      // Campo repetido: nao duplica em extracted_fields, so cria overlay
      onConfirmRepeat(existingMatch.field_name)
      return
    }

    // Campo novo
    const field: ExtractedField = {
      field_name: fieldName,
      label: label.trim(),
      type,
      description: label.trim(),
      required,
      x_percent: rect.x_pct,
      y_percent: rect.y_pct,
      width_percent: rect.w_pct,
      height_percent: rect.h_pct,
      page,
    }
    onConfirm(field)
  }

  // ── Render ──────────────────────────────────────────────────────────────

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
            <h3 className="text-sm font-semibold text-slate-800">
              {isRepeatMode ? 'Adicionar posição extra' : 'Novo campo'}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Página {page + 1} &middot; X:{rect.x_pct.toFixed(1)}% Y:{rect.y_pct.toFixed(1)}%
              {' '}({rect.w_pct.toFixed(1)}% &times; {rect.h_pct.toFixed(1)}%)
            </p>
          </div>
          <button type="button" onClick={onCancel}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Banner explicativo do modo repetir */}
        {isRepeatMode && existingMatch && (
          <div className="flex items-start gap-2 p-3 mb-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-800 leading-snug">
              <p className="font-semibold">Campo já existe no template.</p>
              <p className="mt-0.5">
                Esta posição será vinculada a <code className="px-1 bg-amber-100 rounded">{existingMatch.field_name}</code>.
                Quando o usuário preencher o valor, ele aparecerá nesta posição E em todas as outras
                posições vinculadas (ex: logo/cabeçalho/assinatura repetidos por página).
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {/* Em modo repetir, mostra apenas info do campo (read-only) */}
          {isRepeatMode && existingMatch ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-slate-700">Label</label>
                <div className="mt-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                  {existingMatch.label}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Tipo</label>
                  <div className="mt-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                    {TYPE_LABEL[existingMatch.type]}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">Obrigatório</label>
                  <div className="mt-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                    {existingMatch.required ? 'Sim' : 'Não'}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">field_name</label>
                <div className="mt-1 px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                  {existingMatch.field_name}
                </div>
              </div>
            </div>
          ) : (
            // Campo novo: formulario completo
            <>
              <div>
                <label className="text-xs font-medium text-slate-700">
                  Label <span className="text-red-500">*</span>
                </label>
                <input
                  ref={labelRef}
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="ex: Diâmetro Sistólico"
                  className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Como o campo aparecerá no preenchimento. Aparece também no PDF gerado se mantido.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700">
                  Nome técnico (field_name) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fieldName}
                  onChange={e => { setFieldName(slugify(e.target.value)); setFieldNameTouched(true) }}
                  placeholder="ex: diametro_sistolico"
                  className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  snake_case, usado como variável no PDF ({'{{'}{fieldName || 'campo'}{'}}'}).
                  {' '}<strong>Dica:</strong> digite o nome de um campo existente
                  para criar uma posição adicional (ex: cabeçalho repetido por página).
                </p>
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
                    <span className="text-xs text-slate-700">Obrigatório</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Dropdown para selecionar um campo existente (atalho) — visivel quando NAO esta em repeat mode */}
          {!isRepeatMode && existingFields.length > 0 && (
            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer hover:text-slate-700 select-none">
                <Copy className="w-3 h-3 inline-block -mt-0.5 mr-1" />
                Ou repita um campo já existente nesta posição
              </summary>
              <div className="mt-2 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-1 bg-slate-50">
                {existingFields.map(f => (
                  <button
                    key={f.field_name}
                    type="button"
                    onClick={() => { setFieldName(f.field_name); setFieldNameTouched(true) }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-white text-slate-700"
                  >
                    <span className="font-medium">{f.label}</span>
                    <span className="ml-1 text-slate-400 font-mono text-[10px]">
                      ({f.field_name})
                    </span>
                  </button>
                ))}
              </div>
            </details>
          )}
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
            className={
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ' +
              (isRepeatMode
                ? 'text-white bg-amber-600 hover:bg-amber-700'
                : 'text-white bg-blue-600 hover:bg-blue-700')
            }
          >
            {isRepeatMode
              ? <><Copy className="w-4 h-4" />Adicionar posição extra</>
              : <><Plus className="w-4 h-4" />Adicionar campo</>}
          </button>
        </div>
      </form>
    </div>
  )
}
