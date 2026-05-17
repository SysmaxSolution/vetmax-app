'use client'

import { useRef, useState } from 'react'
import { Palette, Save, RotateCcw, Loader2, Image as ImageIcon, Upload, Trash2 } from 'lucide-react'
import { useTheme } from '@/components/providers/ThemeProvider'
import {
  saveUiPreferences,
  uploadClinicBackground,
  removeClinicBackground,
  type UiPreferences,
  type AppearanceMode,
} from '@/lib/actions/ui-preferences'
import { Toast } from '@/components/ui/toast'

// ─── Presets ──────────────────────────────────────────────────────────────────

const BG_PRESETS = [
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferMode(p: UiPreferences): AppearanceMode {
  if (p.appearance_mode)        return p.appearance_mode
  if (p.background_image_url)   return 'image'
  if (p.custom_bg)              return 'color'
  return 'dynamic'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppearanceTab() {
  const { preferences, setPreferences } = useTheme()

  const [draft,     setDraft]     = useState<UiPreferences>({ ...preferences })
  const [saving,    setSaving]    = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast,     setToast]     = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const mode = inferMode(draft)

  function applyDraft(next: UiPreferences) {
    setDraft(next)
    setPreferences(next) // live preview via ThemeProvider
  }

  function setMode(next: AppearanceMode) {
    if (next === 'dynamic') {
      applyDraft({ ...draft, appearance_mode: 'dynamic', custom_bg: null, background_image_url: null })
    } else if (next === 'color') {
      applyDraft({ ...draft, appearance_mode: 'color', custom_bg: draft.custom_bg ?? '#FFFFFF', background_image_url: null })
    } else {
      applyDraft({ ...draft, appearance_mode: 'image' })
    }
  }

  async function handleSave() {
    setSaving(true)
    const res = await saveUiPreferences({ ...draft, appearance_mode: mode })
    setSaving(false)
    if (res.error) setToast({ type: 'error', message: res.error })
    else           setToast({ type: 'success', message: 'Aparência salva para esta clínica!' })
  }

  function handleReset() {
    const defaults: UiPreferences = { intensity: 'normal', custom_bg: null, background_image_url: null, appearance_mode: 'dynamic' }
    applyDraft(defaults)
  }

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setToast({ type: 'error', message: 'Imagem excede 10 MB' })
      return
    }
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadClinicBackground(fd)
    setUploading(false)
    if ('error' in res) {
      setToast({ type: 'error', message: res.error })
      return
    }
    applyDraft({ ...draft, background_image_url: res.url, appearance_mode: 'image' })
    setToast({ type: 'success', message: 'Imagem de fundo definida!' })
  }

  async function handleRemoveImage() {
    setUploading(true)
    const res = await removeClinicBackground()
    setUploading(false)
    if (res.error) { setToast({ type: 'error', message: res.error }); return }
    applyDraft({ ...draft, background_image_url: null, appearance_mode: draft.custom_bg ? 'color' : 'dynamic' })
    setToast({ type: 'success', message: 'Imagem removida' })
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
            <p className="text-xs text-slate-500">Identidade visual desta clínica — aplica-se a todos os usuários</p>
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

        {/* ── Modo de Fundo ── */}
        <section>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Modo de Fundo</h3>
          <p className="text-xs text-slate-500 mb-3">Escolha como o fundo do sistema é exibido.</p>
          <div className="grid grid-cols-3 gap-3">
            {([
              { value: 'dynamic', label: 'Dinâmico',  desc: 'Cor por módulo' },
              { value: 'color',   label: 'Cor Fixa',  desc: 'Uma cor única' },
              { value: 'image',   label: 'Imagem',    desc: 'Foto de fundo' },
            ] as { value: AppearanceMode; label: string; desc: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={`flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  mode === opt.value ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="text-sm font-semibold text-slate-900">{opt.label}</span>
                <span className="text-xs text-slate-500">{opt.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Intensidade (Dinâmico) ── */}
        {mode === 'dynamic' && (
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Intensidade das Cores por Módulo</h3>
            <p className="text-xs text-slate-500 mb-3">Quão marcante é a cor de fundo em cada módulo.</p>
            <div className="flex gap-3 flex-wrap">
              {INTENSITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => applyDraft({ ...draft, intensity: opt.value })}
                  className={`flex-1 min-w-[120px] flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border-2 text-left transition-all ${
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
        )}

        {/* ── Cor Fixa ── */}
        {mode === 'color' && (
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Cor de Fundo</h3>
            <p className="text-xs text-slate-500 mb-3">Aplica uma cor fixa em todo o sistema.</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
              {BG_PRESETS.map(preset => {
                const isSelected = draft.custom_bg === preset.value
                return (
                  <button
                    key={preset.value}
                    onClick={() => applyDraft({ ...draft, custom_bg: preset.value, background_image_url: null, appearance_mode: 'color' })}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      isSelected ? 'border-slate-900 shadow-md' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className="w-8 h-8 rounded-full border border-slate-200 shadow-inner"
                      style={{ backgroundColor: preset.value }}
                    />
                    <span className="text-[11px] font-medium text-slate-600 text-center leading-tight">{preset.label}</span>
                    {isSelected && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-slate-900" />}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-600 font-medium">Cor personalizada:</label>
              <input
                type="color"
                value={draft.custom_bg ?? '#FFFFFF'}
                onChange={e => applyDraft({ ...draft, custom_bg: e.target.value, background_image_url: null, appearance_mode: 'color' })}
                className="h-8 w-16 rounded border border-slate-200 cursor-pointer"
              />
              <span className="text-xs font-mono text-slate-500">{draft.custom_bg ?? '#FFFFFF'}</span>
            </div>
          </section>
        )}

        {/* ── Imagem de Fundo ── */}
        {mode === 'image' && (
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Imagem de Fundo</h3>
            <p className="text-xs text-slate-500 mb-3">JPG, PNG ou WebP — até 10 MB. A imagem é compartilhada com todos os usuários desta clínica.</p>

            {draft.background_image_url ? (
              <div className="space-y-3">
                <div
                  className="w-full h-48 rounded-xl border border-slate-200 shadow-inner"
                  style={{
                    backgroundImage:    `url("${draft.background_image_url}")`,
                    backgroundSize:     'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat:   'no-repeat',
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Trocar imagem
                  </button>
                  <button
                    onClick={handleRemoveImage}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="w-full flex flex-col items-center justify-center gap-2 py-12 border-2 border-dashed border-slate-300 rounded-xl hover:border-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-slate-400" />
                )}
                <span className="text-sm font-medium text-slate-600">
                  {uploading ? 'Enviando...' : 'Clique para enviar uma imagem'}
                </span>
                <span className="text-xs text-slate-400">JPG, PNG ou WebP · até 10 MB</span>
              </button>
            )}

            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
          </section>
        )}

        {/* ── Nota de pré-visualização ── */}
        <p className="text-xs text-slate-400 italic">
          As alterações são aplicadas em tempo real como pré-visualização. Clique em <strong>Salvar</strong> para persistir para todos os usuários desta clínica.
        </p>
      </div>
    </div>
  )
}
