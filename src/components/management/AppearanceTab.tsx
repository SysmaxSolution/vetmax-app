'use client'

import { useState } from 'react'
import { Palette, Save, RotateCcw, Loader2 } from 'lucide-react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { saveUiPreferences, type UiPreferences } from '@/lib/actions/ui-preferences'
import { Toast } from '@/components/ui/toast'

// ─── Presets ──────────────────────────────────────────────────────────────────

const BG_PRESETS = [
  { label: 'Dinâmico',       value: null,       description: 'Cor automática por módulo' },
  { label: 'Branco',         value: '#FFFFFF',  preview: '#FFFFFF' },
  { label: 'Cinza Suave',    value: '#F8FAFC',  preview: '#F8FAFC' },
  { label: 'Creme',          value: '#FAFAF7',  preview: '#FAFAF7' },
  { label: 'Verde Clínico',  value: '#F0FDF4',  preview: '#F0FDF4' },
  { label: 'Azul Clínico',   value: '#EFF6FF',  preview: '#EFF6FF' },
  { label: 'Lavanda',        value: '#F5F3FF',  preview: '#F5F3FF' },
  { label: 'Âmbar Suave',    value: '#FFFBEB',  preview: '#FFFBEB' },
  { label: 'Rosa Suave',     value: '#FFF1F2',  preview: '#FFF1F2' },
] as const

const INTENSITY_OPTIONS: { value: UiPreferences['intensity']; label: string; desc: string }[] = [
  { value: 'normal',  label: 'Sutil',     desc: 'Toque leve de cor nos módulos' },
  { value: 'intense', label: 'Intenso',   desc: 'Cores mais marcantes por módulo' },
  { value: 'off',     label: 'Desligado', desc: 'Fundo neutro em todos os módulos' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppearanceTab() {
  const { preferences, setPreferences } = useTheme()

  const [draft,   setDraft]   = useState<UiPreferences>({ ...preferences })
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function applyDraft(next: UiPreferences) {
    setDraft(next)
    setPreferences(next) // live preview via ThemeProvider
  }

  async function handleSave() {
    setSaving(true)
    const res = await saveUiPreferences(draft)
    setSaving(false)
    if (res.error) {
      setToast({ type: 'error', message: res.error })
    } else {
      setToast({ type: 'success', message: 'Preferências salvas!' })
    }
  }

  function handleReset() {
    const defaults: UiPreferences = { intensity: 'normal', custom_bg: null }
    applyDraft(defaults)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
            <Palette className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Aparência</h2>
            <p className="text-xs text-slate-500">Personalização visual do sistema para sua conta</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar padrão
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      </div>

      <div className="p-6 space-y-8">

        {/* ── Intensidade ── */}
        <section>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Intensidade das Cores por Módulo</h3>
          <p className="text-xs text-slate-500 mb-3">
            Define quão marcante é a cor de fundo em cada módulo do sistema.
            {draft.custom_bg !== null && (
              <span className="ml-1 text-amber-600">(Inativo quando uma cor personalizada estiver definida)</span>
            )}
          </p>
          <div className="flex gap-3 flex-wrap">
            {INTENSITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => applyDraft({ ...draft, intensity: opt.value })}
                disabled={draft.custom_bg !== null}
                className={`flex-1 min-w-[120px] flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border-2 text-left transition-all disabled:opacity-40 ${
                  draft.intensity === opt.value
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="text-sm font-semibold text-slate-900">{opt.label}</span>
                <span className="text-xs text-slate-500">{opt.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Cor de Fundo Personalizada ── */}
        <section>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Cor de Fundo Personalizada</h3>
          <p className="text-xs text-slate-500 mb-3">
            Substitui as cores dinâmicas por uma cor fixa em todo o sistema.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {BG_PRESETS.map(preset => {
              const isSelected = draft.custom_bg === preset.value
              return (
                <button
                  key={preset.value ?? 'dynamic'}
                  onClick={() => applyDraft({ ...draft, custom_bg: preset.value ?? null })}
                  className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-slate-900 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {preset.value !== null ? (
                    <span
                      className="w-8 h-8 rounded-full border border-slate-200 shadow-inner"
                      style={{ backgroundColor: preset.value }}
                    />
                  ) : (
                    <span className="w-8 h-8 rounded-full border border-slate-200 bg-gradient-to-br from-blue-100 via-violet-100 to-amber-100" />
                  )}
                  <span className="text-[11px] font-medium text-slate-600 text-center leading-tight">
                    {preset.label}
                  </span>
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-slate-900" />
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Nota de pré-visualização ── */}
        <p className="text-xs text-slate-400 italic">
          As alterações são aplicadas em tempo real como pré-visualização. Clique em "Salvar" para persistir.
        </p>
      </div>
    </div>
  )
}
