'use client'

import { useState, useTransition } from 'react'
import { getPetFrequencyReport, type PetFrequencyRow } from '@/lib/actions/reports-g13'
import { speciesLabel } from '@/lib/species'

const SPECIES_OPTIONS = [
  { value: '', label: 'Todas as espécies' },
  { value: 'dog',     label: 'Cão' },
  { value: 'cat',     label: 'Gato' },
  { value: 'bird',    label: 'Ave' },
  { value: 'rabbit',  label: 'Coelho' },
  { value: 'rodent',  label: 'Roedor' },
  { value: 'reptile', label: 'Réptil' },
  { value: 'fish',    label: 'Peixe' },
  { value: 'exotic',  label: 'Exótico' },
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function exportCSV(rows: PetFrequencyRow[]) {
  const header = 'Pet,Espécie,Raça,Tutor,Telefone,Consultas,Última Visita'
  const lines  = rows.map(r =>
    [r.pet_name, r.species, r.breed ?? '', r.tutor_name, r.tutor_phone ?? '',
     r.consult_count, fmtDate(r.last_visit)].join(',')
  )
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `periodicidade-pets-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function PetFrequencyReport() {
  const today       = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [from,    setFrom]    = useState(firstOfMonth)
  const [to,      setTo]      = useState(today)
  const [species, setSpecies] = useState('')
  const [breed,   setBreed]   = useState('')
  const [rows,    setRows]    = useState<PetFrequencyRow[] | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startT]     = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const result = await getPetFrequencyReport({ from, to, species: species || undefined, breed: breed || undefined })
      if ('error' in result) { setError(result.error); return }
      setRows(result)
    })
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Espécie</label>
          <select value={species} onChange={e => setSpecies(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
            {SPECIES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Raça</label>
          <input type="text" placeholder="Todas" value={breed} onChange={e => setBreed(e.target.value)}
            className="w-full sm:w-36 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
        </div>
        <button onClick={run} disabled={pending}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {pending ? 'Carregando…' : 'Gerar'}
        </button>
        {rows && rows.length > 0 && (
          <button onClick={() => exportCSV(rows)}
            className="rounded-lg border border-violet-200 px-4 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50 transition-colors">
            Exportar CSV
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {rows === null && !pending && (
        <div className="rounded-lg bg-violet-50 border border-violet-100 px-4 py-8 text-center text-sm text-violet-500">
          Selecione o período e clique em Gerar para visualizar o relatório.
        </div>
      )}

      {rows !== null && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-violet-50">
              <tr>
                {['Pet', 'Espécie', 'Raça', 'Tutor', 'Telefone', 'Consultas', 'Última Visita'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-violet-800 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhum dado encontrado para o período.</td>
                </tr>
              ) : rows.map(r => (
                <tr key={r.pet_id} className="hover:bg-violet-50/40 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.pet_name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{speciesLabel(r.species)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.breed ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.tutor_name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.tutor_phone ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 text-violet-800 font-bold text-sm">
                      {r.consult_count}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{fmtDate(r.last_visit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows !== null && (
        <p className="text-xs text-slate-400 text-right">
          {rows.length} pet(s) encontrado(s) no período.
        </p>
      )}
    </div>
  )
}
