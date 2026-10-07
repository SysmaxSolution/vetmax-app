'use client'

/**
 * ClinicFontsManager — botão "Fontes" na barra de página do CanvasEditor.
 * Abre um modal (portal no body) com a lista das fontes enviadas pela
 * clínica + formulário de upload (TTF/OTF/WOFF/WOFF2 ≤ 5 MB).
 *
 * Após upload/remoção chama refresh() do CanvaFontsScope — o @font-face e
 * o select de fontes do PropertiesPanel atualizam no mesmo frame.
 */

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Trash2, Type, Upload, X } from 'lucide-react'
import { useCanvaFonts } from '@/components/canva/CanvaFontsScope'
import { CLINIC_FONT_MAX_BYTES, fontFormatFromFilename } from '@/lib/canva/fonts'
import {
  getClinicFontUploadUrl, registerClinicFont, deleteClinicFont,
} from '@/lib/actions/clinic-fonts'

export default function ClinicFontsManager() {
  const [open, setOpen] = useState(false)
  const { clinicFonts } = useCanvaFonts()
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Fontes</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Fontes da clínica (upload TTF/OTF/WOFF2)"
          className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-violet-400 hover:text-violet-700"
        >
          <Type className="w-3 h-3" />
          {clinicFonts.length > 0 ? `${clinicFonts.length} da clínica` : 'Enviar fonte'}
        </button>
      </div>
      {open && <FontsModal onClose={() => setOpen(false)} />}
    </>
  )
}

function FontsModal({ onClose }: { onClose: () => void }) {
  const { clinicFonts, refresh, loading } = useCanvaFonts()
  const fileInput = useRef<HTMLInputElement>(null)
  const [family, setFamily] = useState('')
  const [weight, setWeight] = useState(400)
  const [style, setStyle] = useState<'normal' | 'italic'>('normal')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickFile(f: File | null) {
    setFile(f)
    setError(null)
    if (f && !family) {
      // Sugere o nome da família a partir do arquivo ("Montserrat-Bold.ttf" → "Montserrat")
      setFamily(f.name.replace(/\.[^.]+$/, '').replace(/[-_ ](bold|regular|italic|light|medium|black|thin)/gi, '').trim())
    }
  }

  async function handleUpload() {
    if (!file) { setError('Selecione o arquivo da fonte.'); return }
    if (!family.trim()) { setError('Informe o nome da família (como aparecerá no seletor).'); return }
    if (file.size > CLINIC_FONT_MAX_BYTES) { setError('Arquivo acima de 5 MB.'); return }
    const format = fontFormatFromFilename(file.name)
    if (!format) { setError('Use TTF, OTF, WOFF ou WOFF2.'); return }
    setBusy(true); setError(null)
    try {
      const { upload_url, storage_path } = await getClinicFontUploadUrl(file.name)
      const put = await fetch(upload_url, {
        method: 'PUT', body: file,
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      if (!put.ok) throw new Error(`upload da fonte falhou (${put.status})`)
      await registerClinicFont({
        family_name: family.trim(), storage_path, format,
        font_weight: weight, font_style: style, file_size: file.size,
      })
      await refresh()
      setFile(null); setFamily(''); setWeight(400); setStyle('normal')
      if (fileInput.current) fileInput.current.value = ''
    } catch (e: any) {
      setError(e?.message ?? 'falha ao enviar fonte')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setBusy(true); setError(null)
    try { await deleteClinicFont(id); await refresh() }
    catch (e: any) { setError(e?.message ?? 'falha ao remover') }
    finally { setBusy(false) }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Fontes da clínica</h2>
            <p className="text-[11px] text-slate-500">TTF, OTF, WOFF ou WOFF2 · até 5 MB · ficam disponíveis em todos os modelos</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </header>

        <div className="overflow-y-auto px-4 py-3 space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

          <section className="rounded-lg border border-slate-200 p-3 space-y-2">
            <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Enviar fonte</h3>
            <input
              ref={fileInput}
              type="file"
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
              onChange={e => pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-violet-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-violet-700"
            />
            <div className="grid grid-cols-[1fr_90px_90px] gap-2">
              <label className="block">
                <span className="text-[10px] text-slate-600">Família (nome no seletor)</span>
                <input value={family} onChange={e => setFamily(e.target.value)} placeholder="ex: Montserrat"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-600">Peso</span>
                <select value={weight} onChange={e => setWeight(parseInt(e.target.value, 10))}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs">
                  {[300, 400, 500, 600, 700, 800].map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] text-slate-600">Estilo</span>
                <select value={style} onChange={e => setStyle(e.target.value as 'normal' | 'italic')}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs">
                  <option value="normal">Normal</option>
                  <option value="italic">Itálico</option>
                </select>
              </label>
            </div>
            <p className="text-[10px] text-slate-500">
              Para negrito/itálico reais, envie cada arquivo (Regular, Bold, Italic) com a <strong>mesma família</strong> e o peso/estilo correspondente.
            </p>
            <button
              onClick={handleUpload}
              disabled={busy || !file}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Enviar
            </button>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold text-slate-800">Enviadas ({clinicFonts.length})</h3>
            {loading && clinicFonts.length === 0 ? (
              <p className="text-xs text-slate-500">Carregando…</p>
            ) : clinicFonts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">Nenhuma fonte enviada ainda.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {clinicFonts.map(f => (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 truncate" style={{ fontFamily: `"${f.family_name}", sans-serif`, fontWeight: f.font_weight, fontStyle: f.font_style }}>
                        {f.family_name} — Aa Bb Cc 123
                      </div>
                      <div className="text-[10px] text-slate-500">{f.format} · peso {f.font_weight} · {f.font_style === 'italic' ? 'itálico' : 'normal'}</div>
                    </div>
                    <button onClick={() => handleDelete(f.id)} disabled={busy} title="Remover fonte"
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
