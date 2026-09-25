'use client'

// Identidade visual do Portal do Tutor, por clínica.
// Gestão › Configurações, logo abaixo de "Portal do Tutor & Agendamento".
//
// A pré-visualização é o mesmo cálculo de variáveis CSS que o portal usa em
// produção (`portalThemeCssVars`) — não é uma imitação. O que se vê aqui é
// literalmente o que o tutor vê.

import { useEffect, useState } from 'react'
import { Palette, Loader2, Save, RotateCcw, Link2, PawPrint, ExternalLink } from 'lucide-react'
import {
  getClinicPortalIdentity, saveClinicPortalTheme, resetClinicPortalTheme, saveClinicPortalSlug,
} from '@/lib/actions/portal-theme'
import {
  DEFAULT_PORTAL_THEME, PORTAL_HEADING_FONTS, portalThemeCssVars,
  type PortalTheme, type PortalHeadingFontId,
} from '@/lib/portal/theme'

interface Props {
  onToast: (type: 'success' | 'error', msg: string) => void
}

const SWATCHES: Array<{ key: keyof PortalTheme; label: string; help: string }> = [
  { key: 'primaryDarkColor', label: 'Primária escura', help: 'fundo do topo da página do tutor' },
  { key: 'primaryColor',     label: 'Primária',        help: 'títulos de seção, links e ícones' },
  { key: 'accentColor',      label: 'Acento',          help: 'filetes, anéis e o botão de agendar' },
  { key: 'bgColor',          label: 'Fundo',           help: 'cor de fundo da página' },
  { key: 'surfaceColor',     label: 'Cartões',         help: 'fundo dos blocos de conteúdo' },
  { key: 'textColor',        label: 'Texto',           help: 'cor do texto principal' },
  { key: 'mutedColor',       label: 'Texto secundário', help: 'legendas e datas' },
  { key: 'borderColor',      label: 'Traços',          help: 'bordas e divisórias' },
]

export default function PortalThemeSettings({ onToast }: Props) {
  const [theme, setTheme] = useState<PortalTheme>(DEFAULT_PORTAL_THEME)
  const [slug, setSlug] = useState('')
  const [clinicName, setClinicName] = useState<string | null>(null)
  const [clinicLogo, setClinicLogo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingSlug, setSavingSlug] = useState(false)

  useEffect(() => {
    let alive = true
    getClinicPortalIdentity().then(res => {
      if (!alive) return
      if (!('error' in res)) {
        setTheme(res.theme)
        setSlug(res.slug ?? '')
        setClinicName(res.clinicName)
        setClinicLogo(res.clinicLogo)
      }
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  function set<K extends keyof PortalTheme>(key: K, value: PortalTheme[K]) {
    setTheme(t => ({ ...t, [key]: value }))
  }

  async function save() {
    setSaving(true)
    const res = await saveClinicPortalTheme({
      bgColor: theme.bgColor, surfaceColor: theme.surfaceColor,
      primaryColor: theme.primaryColor, primaryDarkColor: theme.primaryDarkColor,
      accentColor: theme.accentColor, textColor: theme.textColor,
      mutedColor: theme.mutedColor, borderColor: theme.borderColor,
      headingFont: theme.headingFont, coverImageUrl: theme.coverImageUrl,
      tagline: theme.tagline,
    })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Identidade do Portal salva!')
  }

  async function reset() {
    setSaving(true)
    const res = await resetClinicPortalTheme()
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    setTheme(DEFAULT_PORTAL_THEME)
    onToast('success', 'Identidade restaurada para o padrão.')
  }

  async function persistSlug() {
    setSavingSlug(true)
    const res = await saveClinicPortalSlug(slug)
    setSavingSlug(false)
    if ('error' in res) { onToast('error', res.error); return }
    setSlug(res.slug)
    onToast('success', 'Endereço do Portal salvo!')
  }

  const vars = portalThemeCssVars(theme) as React.CSSProperties

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
          <Palette className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Identidade do Portal do Tutor</h3>
          <p className="text-xs text-slate-500">As cores, a fonte e o endereço que o tutor vê ao acessar a sua clínica</p>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-10 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />Carregando…
        </div>
      ) : (
        <div className="px-6 py-5 space-y-6">
          {/* Endereço do portal */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Endereço do Portal</label>
            <div className="flex items-stretch gap-2">
              <div className="flex items-center gap-1 flex-1 rounded-lg border border-slate-200 px-3">
                <Link2 className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                <span className="text-xs text-slate-400 whitespace-nowrap">/portal/c/</span>
                <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="minha-clinica"
                       className="flex-1 min-w-0 py-2 text-sm text-slate-800 outline-none" />
              </div>
              <button onClick={persistSlug} disabled={savingSlug}
                      className="px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5">
                {savingSlug ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Salvar endereço
              </button>
              {slug && (
                <a href={`/portal/c/${slug}`} target="_blank" rel="noopener noreferrer"
                   className="px-3 py-2 text-xs font-semibold text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />Abrir
                </a>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              É por aqui que o tutor entra na SUA clínica. Um tutor atendido em duas clínicas vê
              a identidade de cada uma no endereço correspondente. Deixe em branco e salve para gerar a partir do nome.
            </p>
          </div>

          {/* Cores */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Cores</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SWATCHES.map(s => (
                <div key={s.key as string}>
                  <label className="flex items-center gap-2">
                    <input type="color" value={theme[s.key] as string}
                           onChange={e => set(s.key, e.target.value as never)}
                           className="h-8 w-8 rounded border border-slate-200 bg-white p-0.5 cursor-pointer flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-slate-700 truncate">{s.label}</span>
                      <span className="block text-[10px] text-slate-400 truncate">{s.help}</span>
                    </span>
                  </label>
                  <input value={theme[s.key] as string} onChange={e => set(s.key, e.target.value as never)}
                         className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-[11px] font-mono text-slate-600 uppercase" />
                </div>
              ))}
            </div>
          </div>

          {/* Fonte, frase e capa */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fonte dos títulos</label>
              <select value={theme.headingFont}
                      onChange={e => set('headingFont', e.target.value as PortalHeadingFontId)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800">
                {PORTAL_HEADING_FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Frase do topo</label>
              <input value={theme.tagline ?? ''} onChange={e => set('tagline', e.target.value || null)}
                     placeholder="Portal do Tutor" maxLength={60}
                     className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Imagem de capa (URL)</label>
              <input value={theme.coverImageUrl ?? ''} onChange={e => set('coverImageUrl', e.target.value || null)}
                     placeholder="https://…" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800" />
            </div>
          </div>

          {/* Pré-visualização — usa as MESMAS variáveis do portal em produção */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Pré-visualização</p>
            <div className="rounded-xl overflow-hidden border border-slate-200" style={vars}>
              <div className="flex items-center gap-3 px-4 h-14 bg-[var(--pt-surface)] border-b border-[var(--pt-border)]">
                <span className="h-9 w-9 rounded-full flex items-center justify-center overflow-hidden bg-[var(--pt-primary-dark)]"
                      style={{ boxShadow: '0 0 0 1px var(--pt-accent-soft)' }}>
                  {clinicLogo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={clinicLogo} alt="" className="h-full w-full object-cover" />
                    : <PawPrint className="h-4 w-4 text-[var(--pt-accent)]" />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--pt-text)]" style={{ fontFamily: 'var(--pt-heading-font)' }}>
                    {clinicName ?? 'Sua clínica'}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--pt-muted)]">{theme.tagline || 'Portal do Tutor'}</p>
                </div>
              </div>
              <div className="relative px-6 py-8" style={{ background: 'linear-gradient(135deg, var(--pt-primary-dark), var(--pt-primary-mid) 55%, var(--pt-primary))' }}>
                {theme.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={theme.coverImageUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25" />
                )}
                <div className="relative">
                  <p className="text-[9px] uppercase tracking-[0.24em] text-[var(--pt-accent)]">{theme.tagline || 'Portal do Tutor'}</p>
                  <p className="mt-1 text-2xl text-[var(--pt-on-primary)]" style={{ fontFamily: 'var(--pt-heading-font)' }}>Olá, Melissa.</p>
                </div>
              </div>
              <div className="bg-[var(--pt-bg)] px-6 py-5">
                <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-4 max-w-xs">
                  <div className="flex items-center gap-3">
                    <span className="h-11 w-11 rounded-full bg-[var(--pt-tint)] flex items-center justify-center text-2xl"
                          style={{ boxShadow: '0 0 0 1px var(--pt-accent-line)' }}>🐕</span>
                    <div>
                      <p className="text-[15px] text-[var(--pt-text)]" style={{ fontFamily: 'var(--pt-heading-font)' }}>Tutu</p>
                      <p className="text-[11px] text-[var(--pt-muted-soft)]">{clinicName ?? 'Sua clínica'}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[var(--pt-border-soft)] flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[var(--pt-primary)]">Ver histórico</span>
                    <span className="text-[var(--pt-accent)]">→</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={reset} disabled={saving}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />Restaurar padrão
            </button>
            <button onClick={save} disabled={saving}
                    className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar identidade
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
