'use client'

// Resultados do exame (Fase 2): entrada manual + import HL7 + conferência e
// liberação pelo MV (2.4). Rascunho editável; liberado é imutável.

import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, FlaskConical, CheckCircle2, Upload, Lock, Printer } from 'lucide-react'
import {
  listExamResults, saveExamResults, releaseExamResults, importHL7Results,
  type ExamResultRow,
} from '@/lib/actions/exam-results'
import { getExamLabelData } from '@/lib/actions/exams'
import { printLabels } from '@/components/lab/TubeLabel'

interface Draft { panel: string; analyte_name: string; value_text: string; unit: string; ref_text: string; flag: string }
const emptyDraft = (): Draft => ({ panel: '', analyte_name: '', value_text: '', unit: '', ref_text: '', flag: '' })

const FLAG_BADGE: Record<string, string> = { H: 'bg-red-100 text-red-700', L: 'bg-blue-100 text-blue-700', N: 'bg-emerald-100 text-emerald-700', A: 'bg-amber-100 text-amber-700' }
const FLAG_LABEL: Record<string, string> = { H: 'Alto', L: 'Baixo', N: 'Normal', A: 'Anormal' }

export default function ExamResultsPanel({ consultationId, canRelease = true }: { consultationId: string; canRelease?: boolean }) {
  const [released, setReleased] = useState<ExamResultRow[]>([])
  const [drafts, setDrafts]     = useState<Draft[]>([emptyDraft()])
  const [loading, setLoading]   = useState(true)
  const [busy, setBusy]         = useState(false)
  const [hl7, setHl7]           = useState('')
  const [showHl7, setShowHl7]   = useState(false)
  const [msg, setMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  async function reload() {
    const res = await listExamResults(consultationId)
    if (!('error' in res)) {
      setReleased(res.released)
      setDrafts(res.draft.length ? res.draft.map(d => ({ panel: d.panel ?? '', analyte_name: d.analyte_name, value_text: d.value_text, unit: d.unit ?? '', ref_text: d.ref_text ?? '', flag: d.flag ?? '' })) : [emptyDraft()])
    }
    setLoading(false)
  }
  useEffect(() => { void reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function flash(type: 'ok' | 'err', text: string) { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }
  function setD(i: number, patch: Partial<Draft>) { setDrafts(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d)) }

  async function save() {
    setBusy(true)
    const res = await saveExamResults(consultationId, drafts.map(d => ({
      panel: d.panel || null, analyte_name: d.analyte_name, value_text: d.value_text,
      unit: d.unit || null, ref_text: d.ref_text || null, flag: d.flag || null,
    })))
    setBusy(false)
    if ('error' in res) return flash('err', res.error)
    flash('ok', 'Resultados salvos (rascunho).'); void reload()
  }

  async function doImportHl7() {
    if (!hl7.trim()) return
    setBusy(true)
    const res = await importHL7Results(consultationId, hl7)
    setBusy(false)
    if ('error' in res) return flash('err', res.error)
    flash('ok', `${res.count} resultado(s) importado(s) do HL7.`); setHl7(''); setShowHl7(false); void reload()
  }

  async function printLabel() {
    const d = await getExamLabelData(consultationId)
    if ('error' in d) return flash('err', d.error)
    printLabels([{ sample_code: d.sample_code, patient_name: d.patient_name, tutor_name: d.tutor_name, species: d.species, exams: d.exams }])
  }

  async function release() {
    setBusy(true)
    const res = await releaseExamResults(consultationId)
    setBusy(false)
    if ('error' in res) return flash('err', res.error)
    flash('ok', `${res.released} resultado(s) liberado(s).`); void reload()
  }

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando resultados…</div>

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-teal-500" /> Resultados do exame</h3>
        <div className="flex items-center gap-3">
          <button onClick={printLabel} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"><Printer className="h-3.5 w-3.5" /> Etiqueta do tubo</button>
          <button onClick={() => setShowHl7(v => !v)} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"><Upload className="h-3.5 w-3.5" /> Importar HL7</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {msg && <div className={`rounded-lg px-3 py-2 text-xs ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</div>}

        {showHl7 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <textarea value={hl7} onChange={e => setHl7(e.target.value)} rows={4} placeholder="Cole a mensagem HL7 (ORU) do aparelho…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-teal-500 focus:outline-none" />
            <button onClick={doImportHl7} disabled={busy || !hl7.trim()} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">Importar</button>
          </div>
        )}

        {/* Liberados (imutáveis) */}
        {released.length > 0 && (
          <div className="rounded-lg border border-emerald-200 overflow-hidden">
            <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700"><Lock className="h-3 w-3" /> Liberados</div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-50">
                {released.map(r => (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5 text-slate-400 w-24">{r.panel}</td>
                    <td className="px-2 py-1.5 font-medium text-slate-700">{r.analyte_name}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-800">{r.value_text} {r.unit}</td>
                    <td className="px-2 py-1.5 text-slate-400">{r.ref_text}</td>
                    <td className="px-3 py-1.5">{r.flag && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${FLAG_BADGE[r.flag]}`}>{FLAG_LABEL[r.flag]}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rascunho (editável) */}
        <div className="space-y-2">
          <div className="grid grid-cols-[90px_1fr_90px_70px_100px_70px_28px] gap-1.5 text-[10px] font-bold uppercase text-slate-400 px-1">
            <span>Painel</span><span>Analito</span><span>Valor</span><span>Un.</span><span>Referência</span><span>Flag</span><span />
          </div>
          {drafts.map((d, i) => (
            <div key={i} className="grid grid-cols-[90px_1fr_90px_70px_100px_70px_28px] gap-1.5 items-center">
              <input value={d.panel} onChange={e => setD(i, { panel: e.target.value })} placeholder="Painel" className="rounded border border-slate-200 px-2 py-1 text-xs" />
              <input value={d.analyte_name} onChange={e => setD(i, { analyte_name: e.target.value })} placeholder="Ex: Creatinina" className="rounded border border-slate-200 px-2 py-1 text-xs" />
              <input value={d.value_text} onChange={e => setD(i, { value_text: e.target.value })} placeholder="0,0" className="rounded border border-slate-200 px-2 py-1 text-xs font-mono" />
              <input value={d.unit} onChange={e => setD(i, { unit: e.target.value })} placeholder="mg/dL" className="rounded border border-slate-200 px-2 py-1 text-xs" />
              <input value={d.ref_text} onChange={e => setD(i, { ref_text: e.target.value })} placeholder="0,5-1,5" className="rounded border border-slate-200 px-2 py-1 text-xs" />
              <select value={d.flag} onChange={e => setD(i, { flag: e.target.value })} className="rounded border border-slate-200 px-1 py-1 text-xs">
                <option value="">—</option><option value="N">Normal</option><option value="H">Alto</option><option value="L">Baixo</option><option value="A">Anormal</option>
              </select>
              <button onClick={() => setDrafts(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)} className="text-slate-400 hover:text-rose-500 disabled:opacity-30" disabled={drafts.length <= 1}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button onClick={() => setDrafts(prev => [...prev, emptyDraft()])} className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Adicionar analito</button>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button onClick={save} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar rascunho'}</button>
          {canRelease && (
            <button onClick={release} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 ml-auto">
              <CheckCircle2 className="h-4 w-4" /> Conferir e liberar
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400">O rascunho é editável. Ao <strong>liberar</strong> (Médico Veterinário), o resultado fica imutável e disponível para o laudo/tutor (item 2.4).</p>
      </div>
    </div>
  )
}
