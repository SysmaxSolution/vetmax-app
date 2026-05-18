'use client'

/**
 * CanvaTemplateEditor — painel de configuração de modelo (admin).
 *
 * Split-screen 2-colunas:
 *   ESQUERDA  → Upload do papel timbrado + 4 sliders de margem + seletor solid/transparent.
 *   DIREITA   → Preview A4 reativo (CanvaA4Preview).
 *
 * Substitui ImportTemplateModal para o novo motor canva-native.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  ImagePlus, Loader2, Save, Sparkles, Upload, X,
} from 'lucide-react'
import {
  getBackgroundUploadUrl, getBackgroundReadUrl, updateTemplateCanvaConfig,
} from '@/lib/actions/canva-templates'
import {
  CANVA_DEFAULT_MARGINS,
  CANVA_MAX_MARGIN_CM, CANVA_MIN_MARGIN_CM, CANVA_MARGIN_STEP_CM,
  type CanvaBlockStyle, type CanvaMargins,
} from '@/lib/canva/types'
import CanvaA4Preview from './CanvaA4Preview'

interface Props {
  templateId: string
  templateName: string
  initial: {
    background_image_url: string | null
    margins: CanvaMargins
    block_style: CanvaBlockStyle
  }
  onClose?: () => void
  onSaved?: () => void
}

const MOCK_PATIENT = {
  patient_name: 'Toby',
  tutor_name: 'Maria Silva',
  species: 'Canino',
  breed: 'Golden Retriever',
  age: '4 anos',
  sex: 'Macho',
  weight: '28,4 kg',
  date: new Date().toLocaleDateString('pt-BR'),
  vet_name: 'Dra. Laís',
  crmv: 'CRMV-SP 12345',
}

const MOCK_CONTENT = {
  static_fields: {
    medicamentos: 'Dipirona 25mg/mL — solução oral.\nVermífugo Drontal Plus — 1 comprimido por 10 kg.',
    posologia: '1 mL a cada 8h por 5 dias.\nDose única, repetir em 30 dias.',
    observacoes: 'Retornar em 7 dias para reavaliação.',
  },
  dynamic_fields: [
    { key: 'Pressão Arterial', value: '120/80 mmHg' },
    { key: 'Glicemia', value: '95 mg/dL' },
  ],
}

export default function CanvaTemplateEditor({
  templateId, templateName, initial, onClose, onSaved,
}: Props) {
  const [bgUrl, setBgUrl] = useState<string | null>(initial.background_image_url)
  const [margins, setMargins] = useState<CanvaMargins>(initial.margins ?? CANVA_DEFAULT_MARGINS)
  const [blockStyle, setBlockStyle] = useState<CanvaBlockStyle>(initial.block_style ?? 'solid')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const { upload_url, storage_path } = await getBackgroundUploadUrl(file.name)
      const put = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error(`upload falhou (${put.status})`)
      const { signed_read_url } = await getBackgroundReadUrl(storage_path)
      setBgUrl(signed_read_url)
    } catch (e: any) {
      setError(e?.message ?? 'falha no upload')
    } finally {
      setUploading(false)
    }
  }

  function handleSave() {
    setError(null)
    startSave(async () => {
      try {
        await updateTemplateCanvaConfig({
          template_id: templateId,
          background_image_url: bgUrl,
          margin_top: margins.top,
          margin_bottom: margins.bottom,
          margin_left: margins.left,
          margin_right: margins.right,
          block_style: blockStyle,
        })
        setSavedAt(new Date().toLocaleTimeString('pt-BR'))
        onSaved?.()
      } catch (e: any) {
        setError(e?.message ?? 'falha ao salvar')
      }
    })
  }

  function setMargin(k: keyof CanvaMargins, v: number) {
    setMargins(m => ({ ...m, [k]: Number(v.toFixed(1)) }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-slate-900/40 backdrop-blur-sm">
      <div className="m-auto flex h-[92vh] w-[min(1280px,96vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-violet-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Editor de Modelo</h2>
              <p className="text-xs text-slate-500">{templateName} · motor Canva Nativo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && <span className="text-xs text-emerald-600">Salvo às {savedAt}</span>}
            <button
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={handleSave}
              disabled={isSaving || uploading}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
            {onClose && (
              <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="bg-red-50 px-6 py-2 text-xs text-red-700">{error}</div>
        )}

        {/* Split body */}
        <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[380px_1fr]">
          {/* LEFT — config */}
          <aside className="flex flex-col gap-5 overflow-y-auto border-r border-slate-200 bg-slate-50 p-6">
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ImagePlus className="w-4 h-4 text-violet-600" />
                Papel timbrado de fundo
              </h3>
              <p className="text-xs text-slate-500">
                Imagem A4 alta resolução (PNG/JPG/WEBP, ≤ 10 MB). Toda folha do laudo
                herda esse fundo, incluindo páginas seguintes em receitas longas.
              </p>

              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700 hover:border-violet-400 hover:bg-violet-50 disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {bgUrl ? 'Trocar imagem' : 'Enviar papel timbrado'}
                </button>
                {bgUrl && (
                  <button
                    type="button"
                    onClick={() => setBgUrl(null)}
                    className="text-left text-xs text-red-600 hover:underline"
                  >
                    Remover papel timbrado
                  </button>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">Margens de segurança (cm)</h3>
              <p className="text-xs text-slate-500">
                Distância entre o bloco de dados do pet e a borda do papel — evita
                colidir com logo/cabeçalho/rodapé do timbrado.
              </p>
              {(['top', 'right', 'bottom', 'left'] as const).map(k => (
                <MarginSlider
                  key={k}
                  label={LABELS[k]}
                  value={margins[k]}
                  onChange={v => setMargin(k, v)}
                />
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Estilo do bloco do pet</h3>
              <div className="grid grid-cols-2 gap-2">
                {(['solid', 'transparent'] as const).map(style => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setBlockStyle(style)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      blockStyle === style
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {style === 'solid' ? 'Caixa cinza' : 'Transparente'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                {blockStyle === 'solid'
                  ? 'Caixa cinza arredondada com fundo translúcido — recomendado para timbrados coloridos.'
                  : 'Texto flutuando direto sobre o timbrado — ideal para papéis mais limpos.'}
              </p>
            </section>
          </aside>

          {/* RIGHT — preview */}
          <main className="flex flex-col items-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.06),transparent_60%)] p-6">
            <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-700">Preview em tempo real</span>
              <span>Margens em cm · escala A4 vertical (210 × 297 mm)</span>
            </div>
            <div className="w-full max-w-[640px]">
              <CanvaA4Preview
                backgroundUrl={bgUrl}
                margins={margins}
                blockStyle={blockStyle}
                patient={MOCK_PATIENT}
                content={MOCK_CONTENT}
                documentTitle="Receituário (demonstração)"
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

const LABELS = {
  top:    'Margem superior',
  right:  'Margem direita',
  bottom: 'Margem inferior',
  left:   'Margem esquerda',
} as const

function MarginSlider({
  label, value, onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-xs font-semibold text-slate-900">{value.toFixed(1)} cm</span>
      </div>
      <input
        type="range"
        min={CANVA_MIN_MARGIN_CM}
        max={CANVA_MAX_MARGIN_CM}
        step={CANVA_MARGIN_STEP_CM}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="canva-slider w-full"
      />
    </label>
  )
}
