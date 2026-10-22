'use client'

// Bipar a etiqueta do tubo → o sistema retorna os exames vinculados à amostra.
// O leitor de código de barras funciona como teclado (digita + Enter).

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ScanLine, Loader2, X, FlaskConical, Printer } from 'lucide-react'
import { getExamsBySample, type SampleInfo } from '@/lib/actions/exams'
import { printLabels } from '@/components/lab/TubeLabel'

export default function SampleScanLookup() {
  const [code, setCode] = useState('')
  const [res, setRes]   = useState<SampleInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function lookup(value = code) {
    const v = value.trim()
    if (!v) return
    setLoading(true); setError(null)
    const r = await getExamsBySample(v)
    setLoading(false)
    if ('error' in r) { setError(r.error); setRes(null); return }
    setRes(r)
    setCode('')
    inputRef.current?.focus()
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <ScanLine className="h-4 w-4 text-teal-600" />
        <span className="text-sm font-semibold text-slate-800">Bipar amostra</span>
        <span className="text-xs text-slate-400">— leia a etiqueta do tubo (ou digite o nº da OS)</span>
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup() } }}
          placeholder="Bipe aqui ou digite o código…"
          autoFocus
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
        <button onClick={() => lookup()} disabled={loading || !code.trim()} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} Buscar
        </button>
      </div>

      {error && <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-center justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="h-3.5 w-3.5" /></button></div>}

      {res && (
        <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">{res.patient_name}{res.species ? ` · ${res.species}` : ''}</p>
              <p className="text-xs text-slate-500">Amostra <span className="font-mono">{res.sample_code}</span>{res.tutor_name ? ` · Tutor: ${res.tutor_name}` : ''}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => printLabels([{ sample_code: res.sample_code, patient_name: res.patient_name, tutor_name: res.tutor_name, species: res.species, exams: res.exams }])}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"><Printer className="h-3.5 w-3.5" /> Etiqueta</button>
              <Link href={`/dashboard/exams/${res.consultation_id}`} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">Abrir exame</Link>
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[11px] font-semibold uppercase text-slate-400 mb-1">Exames vinculados a esta amostra</p>
            {res.exams.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhum serviço/exame vinculado a esta OS.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {res.exams.map((e, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700"><FlaskConical className="h-3 w-3" />{e}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
