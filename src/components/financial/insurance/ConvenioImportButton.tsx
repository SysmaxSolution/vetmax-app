'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, ArrowRight, FileSpreadsheet } from 'lucide-react'
import { previewConvenioHeaders, importConvenioRemittance } from '@/lib/actions/convenio-import'
import type { ColumnMapping, ConvenioField } from '@/lib/finance/convenio-csv'

const FIELDS: { key: ConvenioField; label: string; required?: boolean }[] = [
  { key: 'externalId', label: 'ID do atendimento' },
  { key: 'serviceDate', label: 'Data' },
  { key: 'tutorName', label: 'Tutor' },
  { key: 'petName', label: 'Pet' },
  { key: 'procedureName', label: 'Procedimento' },
  { key: 'repassValue', label: 'Valor de repasse', required: true },
  { key: 'coparticipationValue', label: 'Coparticipação' },
  { key: 'veterinarian', label: 'Veterinário' },
  { key: 'microchip', label: 'Microchip' },
  { key: 'planName', label: 'Plano' },
]

export default function ConvenioImportButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [provider, setProvider] = useState('AVA')
  const [remNumber, setRemNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setError(null)
    const text = await file.text()
    setCsvText(text)
    if (!remNumber) setRemNumber(file.name.replace(/\.[^.]+$/, ''))
    const r = await previewConvenioHeaders(text)
    if ('error' in r) { setError(r.error); return }
    setHeaders(r.headers)
    // auto-mapeia por nome parecido
    const guess: ColumnMapping = {}
    const norm = (s: string) => s.toLowerCase()
    for (const h of r.headers) {
      const n = norm(h)
      if (/repass|valor.*repas|l[ií]quido/.test(n)) guess.repassValue = h
      else if (/copart/.test(n)) guess.coparticipationValue = h
      else if (/data|dt/.test(n)) guess.serviceDate = h
      else if (/tutor|cliente|respons/.test(n)) guess.tutorName = h
      else if (/pet|animal|paciente/.test(n)) guess.petName = h
      else if (/procedimento|servi|exame/.test(n)) guess.procedureName = h
      else if (/vet|m[ée]dico/.test(n)) guess.veterinarian = h
      else if (/chip/.test(n)) guess.microchip = h
      else if (/plano/.test(n)) guess.planName = h
      else if (/id|atend|guia|senha/.test(n)) guess.externalId = h
    }
    setMapping(guess)
  }

  async function submit() {
    if (!mapping.repassValue) { setError('Mapeie a coluna de valor de repasse.'); return }
    if (!remNumber.trim()) { setError('Informe o número do demonstrativo.'); return }
    setBusy(true); setError(null)
    const r = await importConvenioRemittance({ providerName: provider, remittanceNumber: remNumber, csvText, mapping })
    setBusy(false)
    if ('error' in r) { setError(r.error); return }
    router.push(`/dashboard/financial/insurance-reconciliation/${r.remittanceId}/review`)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <Upload className="h-4 w-4" />Importar de outro convênio (CSV)
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-purple-600" />
              <h3 className="font-semibold text-slate-800">Importar demonstrativo de convênio</h3>
            </div>
            <div className="p-6 space-y-4">
              {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">Convênio</label><input value={provider} onChange={e => setProvider(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="AVA" /></div>
                <div><label className="text-xs text-slate-500">Nº do demonstrativo</label><input value={remNumber} onChange={e => setRemNumber(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Arquivo CSV do demonstrativo</label>
                <input type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-50 file:px-3 file:py-2 file:text-purple-700" />
              </div>

              {headers.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Mapeie as colunas do arquivo</p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {FIELDS.map(f => (
                      <div key={f.key} className="flex items-center gap-2 text-sm">
                        <span className="w-40 text-slate-600">{f.label}{f.required && <span className="text-rose-500"> *</span>}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                        <select value={mapping[f.key] ?? ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value || undefined }))}
                          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                          <option value="">—</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={submit} disabled={busy || headers.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Importar e conciliar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
