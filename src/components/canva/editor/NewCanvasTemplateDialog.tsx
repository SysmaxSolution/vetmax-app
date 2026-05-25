'use client'

/**
 * NewCanvasTemplateDialog — porta de entrada do Canvas Editor.
 *
 * Pergunta apenas Nome + Tipo, cria um document_templates vazio no banco
 * (canvas_state com page padrão e elements: []), e devolve o ID para o
 * parent abrir o CanvasEditor diretamente.
 *
 * Substitui o ImportTemplateModal antigo (que esperava PDF e quebrava
 * com PNG). O motor visual não importa — ele monta do zero.
 */

import { useState, useTransition } from 'react'
import { Copy, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { createBlankCanvasTemplate } from '@/lib/actions/canva-templates'
import InheritTemplatePicker from './InheritTemplatePicker'

type TemplateType = 'laudo' | 'receita' | 'encaminhamento' | 'termo' | 'exame' | 'outro'

const TYPE_OPTIONS: { value: TemplateType; label: string; hint: string }[] = [
  { value: 'receita',        label: 'Receita',        hint: 'Prescrição medicamentosa' },
  { value: 'laudo',          label: 'Laudo',          hint: 'Resultado de exame' },
  { value: 'encaminhamento', label: 'Encaminhamento', hint: 'Para especialista' },
  { value: 'termo',          label: 'Termo',          hint: 'Documento legal' },
  { value: 'exame',          label: 'Exame',          hint: 'Solicitação de exame' },
  { value: 'outro',          label: 'Outro',          hint: 'Genérico' },
]

interface Props {
  onClose: () => void
  onCreated: (templateId: string, name: string, type: TemplateType) => void
}

export default function NewCanvasTemplateDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<TemplateType>('receita')
  const [error, setError] = useState<string | null>(null)
  const [submitting, startSubmit] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(false)

  function submit() {
    setError(null)
    const n = name.trim()
    if (!n) {
      setError('Informe um nome para o modelo.')
      return
    }
    startSubmit(async () => {
      try {
        const { id } = await createBlankCanvasTemplate({ name: n, type })
        onCreated(id, n, type)
      } catch (e: any) {
        setError(e?.message ?? 'falha ao criar modelo')
      }
    })
  }

  function openInheritPicker() {
    setError(null)
    if (!name.trim()) {
      setError('Informe um nome antes de herdar um modelo.')
      return
    }
    setPickerOpen(true)
  }

  if (pickerOpen) {
    return (
      <InheritTemplatePicker
        name={name.trim()}
        type={type}
        onBack={() => setPickerOpen(false)}
        onClose={onClose}
        onCreated={onCreated}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Novo Modelo em Branco</h2>
              <p className="text-xs text-slate-500">Monte arrastando elementos no editor visual</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Nome do modelo</span>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder='Ex: "Receita Padrão", "Laudo de Ecografia", "Atestado"'
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </label>

          <fieldset>
            <legend className="text-xs font-semibold text-slate-700 mb-1.5">Tipo</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition ${
                    type === opt.value
                      ? 'border-violet-600 bg-violet-50 text-violet-700'
                      : 'border-slate-200 text-slate-700 hover:border-slate-400'
                  }`}
                >
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="text-[10px] text-slate-500">{opt.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-[11px] text-violet-800 leading-relaxed">
            <strong>Como funciona:</strong> o modelo começa como uma folha A4 vazia. Você arrasta
            elementos (texto, imagem, linhas, tags do banco e listas repetíveis) no editor visual.
            Pode subir o papel timbrado da clínica como fundo a qualquer momento.
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={openInheritPicker}
            disabled={submitting || !name.trim()}
            title="Aproveitar layout, papel timbrado e elementos de um modelo já existente"
            className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            <Copy className="w-4 h-4" />
            Herdar de modelo…
          </button>
          <button
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar e abrir editor
          </button>
        </footer>
      </div>
    </div>
  )
}
