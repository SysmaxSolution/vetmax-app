'use client'

/**
 * DocumentIdentityModal — Gestão > Modelos > "Identidade documental".
 *
 * Configura, por clínica, o que TODOS os modelos herdam por padrão:
 * página (tamanho/orientação/margens), fonte, cores, cabeçalho (logo +
 * linhas com tags), rodapé (texto, Pág. X de Y, QR de validação) e bloco
 * de assinatura do MV. Preview ao vivo com dados de exemplo.
 *
 * Portal no body (padrão do projeto). Salva em clinic_document_identity (0467).
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, Loader2, RotateCcw, Save, X } from 'lucide-react'
import CanvaFontsScope, { useCanvaFonts } from '@/components/canva/CanvaFontsScope'
import CanvasStage from '@/components/canva/editor/CanvasStage'
import { fontOptions } from '@/lib/canva/fonts'
import {
  DEFAULT_IDENTITY, applyIdentityToState, hydrateIdentity, type DocumentIdentity,
} from '@/lib/canva/identity'
import { defaultCanvasState, PAGE_PRESETS, PAGE_SIZES, pageDimensionsCm, type PageSize } from '@/lib/canva/canvas-state'
import { mockResolveContext } from '@/lib/canva/mock-data'
import { withDocPageContext } from '@/lib/canva/pagination'
import { getClinicDocumentIdentity, saveClinicDocumentIdentity } from '@/lib/actions/clinic-identity'

interface ClinicPreview {
  name?: string | null
  cnpj?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  logo_url?: string | null
}

interface Props {
  clinic: ClinicPreview
  onClose: () => void
  onSaved?: () => void
}

export default function DocumentIdentityModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <CanvaFontsScope className="fixed inset-0 z-50 flex items-stretch bg-slate-900/40 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={props.onClose} />
      <IdentityEditor {...props} />
    </CanvaFontsScope>,
    document.body,
  )
}

function IdentityEditor({ clinic, onClose, onSaved }: Props) {
  const [identity, setIdentity] = useState<DocumentIdentity>(DEFAULT_IDENTITY)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()
  const { clinicFonts } = useCanvaFonts()

  useEffect(() => {
    let alive = true
    getClinicDocumentIdentity()
      .then(r => { if (alive) { setIdentity(r.identity); setConfigured(r.configured) } })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const patch = <K extends keyof DocumentIdentity>(k: K, v: Partial<DocumentIdentity[K]>) =>
    setIdentity(prev => ({ ...prev, [k]: { ...(prev[k] as object), ...v } as DocumentIdentity[K] }))

  // Preview: modelo vazio + identidade, com dados de exemplo e a clínica real
  const previewState = useMemo(() => applyIdentityToState(defaultCanvasState(), identity, { adoptPage: true }), [identity])
  const previewCtx = useMemo(() => {
    const base = mockResolveContext()
    const city = clinic.city ?? '', uf = clinic.state ?? ''
    return withDocPageContext({
      ...base,
      clinic: {
        ...base.clinic,
        name: clinic.name || 'Clínica Exemplo',
        cnpj: clinic.cnpj || '12.345.678/0001-90',
        phone: clinic.phone || '(16) 3333-4444',
        address: clinic.address || 'Rua Exemplo, 123',
        city, state: uf,
        city_state: city && uf ? `${city}/${uf}` : (city || uf),
        logo_url: clinic.logo_url ?? undefined,
      },
      doc: { verify_code_fmt: 'K7Q2M-9XR4T' },
    }, { pageNumber: 1, totalPages: 2 })
  }, [clinic])
  const previewW = Math.min(pageDimensionsCm(previewState.page).w, 21)

  function handleSave() {
    setError(null)
    startSave(async () => {
      try {
        await saveClinicDocumentIdentity(identity)
        setConfigured(true)
        onSaved?.()
        onClose()
      } catch (e: any) {
        setError(e?.message ?? 'falha ao salvar identidade')
      }
    })
  }

  return (
    <div className="relative m-auto flex h-[94vh] w-[min(1400px,98vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <BadgeCheck className="w-5 h-5 text-violet-600 flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Identidade documental da clínica</h2>
            <p className="text-xs text-slate-500">
              Cabeçalho, rodapé, cores, fonte e página padrão herdados por todos os modelos novos ·{' '}
              {loading ? 'carregando…' : configured ? 'configurada' : 'usando padrão (ainda não salva)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIdentity(hydrateIdentity(null))}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="Voltar ao padrão do sistema (não salva)"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Padrão
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar identidade
          </button>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
      </header>

      {error && <div className="bg-red-50 px-5 py-2 text-xs text-red-700 flex-shrink-0">{error}</div>}

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[400px_1fr] overflow-hidden">
        {/* Form */}
        <aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-4 space-y-4 text-xs">
          <Card title="Página padrão">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] text-slate-600">Tamanho</span>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={identity.defaultPage.size}
                  onChange={e => {
                    const size = e.target.value as PageSize
                    patch('defaultPage', { size, customMm: size === 'custom' ? (identity.defaultPage.customMm ?? { w: 210, h: 297 }) : null })
                  }}
                >
                  {PAGE_SIZES.map(s => (
                    <option key={s} value={s}>{s === 'custom' ? 'Personalizado' : `${PAGE_PRESETS[s].label} (${PAGE_PRESETS[s].wMm}×${PAGE_PRESETS[s].hMm} mm)`}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-600">Orientação</span>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={identity.defaultPage.orientation}
                  onChange={e => patch('defaultPage', { orientation: e.target.value as 'portrait' | 'landscape' })}
                >
                  <option value="portrait">Retrato</option>
                  <option value="landscape">Paisagem</option>
                </select>
              </label>
            </div>
            {identity.defaultPage.size === 'custom' && (
              <div className="mt-2 flex items-center gap-1">
                <input type="number" min={30} max={1200} className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                  value={identity.defaultPage.customMm?.w ?? 210}
                  onChange={e => patch('defaultPage', { customMm: { w: Number(e.target.value), h: identity.defaultPage.customMm?.h ?? 297 } })} />
                <span className="text-slate-400">×</span>
                <input type="number" min={30} max={1200} className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
                  value={identity.defaultPage.customMm?.h ?? 297}
                  onChange={e => patch('defaultPage', { customMm: { w: identity.defaultPage.customMm?.w ?? 210, h: Number(e.target.value) } })} />
                <span className="text-slate-500">mm</span>
              </div>
            )}
            <div className="mt-2 grid grid-cols-4 gap-1">
              {(['top', 'right', 'bottom', 'left'] as const).map(k => (
                <label key={k} className="block">
                  <span className="text-[9px] uppercase text-slate-500">{{ top: 'Topo', right: 'Dir.', bottom: 'Base', left: 'Esq.' }[k]} (mm)</span>
                  <input type="number" min={0} max={100} className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs"
                    value={Math.round(identity.defaultPage.margins[k] * 10)}
                    onChange={e => patch('defaultPage', { margins: { ...identity.defaultPage.margins, [k]: Number(e.target.value) / 10 } })} />
                </label>
              ))}
            </div>
          </Card>

          <Card title="Fonte e cores">
            <label className="block">
              <span className="text-[10px] text-slate-600">Fonte padrão</span>
              <select
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                value={identity.defaultFontFamily}
                onChange={e => setIdentity(prev => ({ ...prev, defaultFontFamily: e.target.value }))}
              >
                {fontOptions(clinicFonts).map(o => (
                  <option key={o.family} value={o.family}>{o.family}{o.source === 'clinica' ? ' (da clínica)' : ''}</option>
                ))}
              </select>
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['primary', 'secondary', 'text'] as const).map(k => (
                <label key={k} className="block">
                  <span className="text-[10px] text-slate-600">{{ primary: 'Principal', secondary: 'Secundária', text: 'Texto' }[k]}</span>
                  <div className="flex items-center gap-1">
                    <input type="color" value={identity.colors[k].slice(0, 7)}
                      onChange={e => patch('colors', { [k]: e.target.value } as Partial<DocumentIdentity['colors']>)}
                      className="h-7 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0" />
                    <span className="font-mono text-[10px] text-slate-500">{identity.colors[k]}</span>
                  </div>
                </label>
              ))}
            </div>
          </Card>

          <Card title="Cabeçalho (repete em todas as páginas)">
            <Toggle label="Ativar cabeçalho" checked={identity.header.enabled} onChange={v => patch('header', { enabled: v })} />
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Toggle label="Logo da clínica" checked={identity.header.showLogo} onChange={v => patch('header', { showLogo: v })} />
              <label className="block">
                <span className="text-[10px] text-slate-600">Posição do logo</span>
                <select className="w-full rounded border border-slate-300 px-2 py-1 text-xs" value={identity.header.logoPosition}
                  onChange={e => patch('header', { logoPosition: e.target.value as 'left' | 'right' })}>
                  <option value="left">Esquerda</option>
                  <option value="right">Direita</option>
                </select>
              </label>
            </div>
            <span className="mt-2 block text-[10px] text-slate-600">Linhas (aceitam tags como {'{{clinica.name}}'}, {'{{clinica.phone}}'}, {'{{vet.name}}'})</span>
            {identity.header.lines.map((line, i) => (
              <input key={i} className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs" value={line}
                onChange={e => {
                  const lines = [...identity.header.lines]; lines[i] = e.target.value
                  patch('header', { lines })
                }} />
            ))}
            <div className="mt-1 flex gap-2">
              {identity.header.lines.length < 5 && (
                <button type="button" className="text-[11px] text-violet-700 hover:underline"
                  onClick={() => patch('header', { lines: [...identity.header.lines, ''] })}>+ linha</button>
              )}
              {identity.header.lines.length > 1 && (
                <button type="button" className="text-[11px] text-slate-500 hover:underline"
                  onClick={() => patch('header', { lines: identity.header.lines.slice(0, -1) })}>− última</button>
              )}
            </div>
            <Toggle className="mt-2" label="Linha divisória" checked={identity.header.showDivider} onChange={v => patch('header', { showDivider: v })} />
          </Card>

          <Card title="Rodapé (repete em todas as páginas)">
            <Toggle label="Ativar rodapé" checked={identity.footer.enabled} onChange={v => patch('footer', { enabled: v })} />
            <label className="mt-1 block">
              <span className="text-[10px] text-slate-600">Texto</span>
              <textarea rows={2} className="w-full rounded border border-slate-300 px-2 py-1 text-xs" value={identity.footer.text}
                onChange={e => patch('footer', { text: e.target.value })} />
            </label>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <Toggle label="Pág. X de Y" checked={identity.footer.showPageNumber} onChange={v => patch('footer', { showPageNumber: v })} />
              <Toggle label="QR de validação" checked={identity.footer.showQr} onChange={v => patch('footer', { showQr: v })} />
              <Toggle label="Linha divisória" checked={identity.footer.showDivider} onChange={v => patch('footer', { showDivider: v })} />
            </div>
          </Card>

          <Card title="Assinatura do MV (página 1)">
            <div className="grid grid-cols-3 gap-1">
              <Toggle label="Ativar" checked={identity.signature.enabled} onChange={v => patch('signature', { enabled: v })} />
              <Toggle label="Imagem" checked={identity.signature.showImage} onChange={v => patch('signature', { showImage: v })} />
              <Toggle label="CRMV" checked={identity.signature.showCrmv} onChange={v => patch('signature', { showCrmv: v })} />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">A imagem vem do perfil do MV (Gestão &gt; Usuários &gt; assinatura eletrônica). O logo vem de Gestão &gt; Aparência.</p>
          </Card>
        </aside>

        {/* Preview */}
        <main className="overflow-auto bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.06),transparent_60%)] p-6">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Preview</span>
            <span>Dados de exemplo (Toby / Maria Silva) com a sua clínica. QR aparece só em documentos emitidos.</span>
          </div>
          <div className="mx-auto" style={{ width: `${previewW}cm`, maxWidth: '100%' }}>
            <CanvasStage
              state={previewState}
              mode="print"
              resolveContext={previewCtx}
            />
          </div>
        </main>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-xs font-semibold text-slate-800">{title}</h3>
      {children}
    </section>
  )
}

function Toggle({ label, checked, onChange, className }: { label: string; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={`flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer ${className ?? ''}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-violet-600" />
      {label}
    </label>
  )
}
