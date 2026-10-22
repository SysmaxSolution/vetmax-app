'use client'

// Digitação da lâmina — o que o analisador não mede.
//
// Mostra só as linhas que a tabela da clínica marcou como digitáveis: o
// diferencial lido no microscópio, os campos de texto e os valores do aparelho
// que o laboratório pode corrigir (plaquetas). O que o aparelho já resolveu
// sozinho não aparece aqui — não há o que conferir.

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Microscope, Save, Lock, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  listManualEntryFields, saveManualEntries,
  type ManualField, type ManualEntriesView,
} from '@/lib/actions/exam-manual-entries'

const SECAO: Record<string, string> = {
  erythrogram: 'Série vermelha',
  leukogram:   'Série branca',
  platelets:   'Série plaquetária',
  biochem:     'Bioquímica',
  other:       'Outros',
}

const ORDEM_SECAO = ['erythrogram', 'leukogram', 'platelets', 'biochem', 'other']

export default function SlideEntryPanel({ consultationId }: { consultationId: string }) {
  const [view, setView]       = useState<ManualEntriesView | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [erro, setErro]       = useState<string | null>(null)
  const [msg, setMsg]         = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const res = await listManualEntryFields(consultationId)
    if ('error' in res) { setErro(res.error); setLoading(false); return }
    setView(res)
    setValores(Object.fromEntries(res.fields.map(f => [f.label, f.value ?? ''])))
    setLoading(false)
  }, [consultationId])

  useEffect(() => { void carregar() }, [carregar])

  async function salvar() {
    if (!view) return
    setBusy(true); setErro(null)
    const res = await saveManualEntries(
      consultationId,
      view.fields.map(f => ({ item_id: f.item_id, label: f.label, value: valores[f.label] ?? '' })),
    )
    setBusy(false)
    if ('error' in res) { setErro(res.error); return }
    setMsg(`${res.saved} campo(s) gravado(s). O laudo já reflete.`)
    setTimeout(() => setMsg(null), 4000)
    void carregar()
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando campos de digitação…
      </div>
    )
  }

  // Sem tabela de referência cadastrada não há o que digitar — o laudo sai
  // inteiro com o que o aparelho mandou, como era antes.
  if (erro) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {erro}
      </div>
    )
  }
  if (!view || view.fields.length === 0) return null

  const porSecao = ORDEM_SECAO
    .map(s => ({ secao: s, campos: view.fields.filter(f => f.section === s) }))
    .filter(g => g.campos.length > 0)

  const preenchidos = view.fields.filter(f => (valores[f.label] ?? '').trim() !== '').length

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Microscope className="h-4 w-4 text-teal-600 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">Digitação da lâmina</h3>
            <p className="text-xs text-slate-500 truncate">
              {view.set_name} · {preenchidos} de {view.fields.length} preenchido(s)
            </p>
          </div>
        </div>
        {view.locked ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
            <Lock className="h-3.5 w-3.5" /> Laudo liberado
          </span>
        ) : (
          <button
            onClick={salvar} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </button>
        )}
      </header>

      {msg && (
        <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> {msg}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {porSecao.map(({ secao, campos }) => (
          <section key={secao} className="px-4 py-3">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {SECAO[secao] ?? secao}
            </h4>
            <div className="space-y-2">
              {campos.map(f => (
                <Campo
                  key={f.item_id}
                  f={f}
                  valor={valores[f.label] ?? ''}
                  locked={view.locked}
                  onChange={v => setValores(prev => ({ ...prev, [f.label]: v }))}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] leading-relaxed text-slate-500">
        O que é digitado aqui fica registrado como leitura do laboratório, separado
        do que o analisador mediu. Campos em branco não saem no laudo.
      </footer>
    </div>
  )
}

function Campo({
  f, valor, locked, onChange,
}: { f: ManualField; valor: string; locked: boolean; onChange: (v: string) => void }) {
  const alterado = f.device_value !== null && valor.trim() !== '' && valor.trim() !== f.device_value

  // Observações e notas são parágrafos — merecem uma caixa de texto de verdade.
  if (f.source === 'text') {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`m-${f.item_id}`}>
          {f.label}
        </label>
        <textarea
          id={`m-${f.item_id}`} rows={2} value={valor} disabled={locked}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label className="min-w-[11rem] flex-1 text-sm text-slate-700" htmlFor={`m-${f.item_id}`}>
        {f.label}
        {f.source === 'slide' && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-teal-600">lâmina</span>}
      </label>

      <div className="flex items-center gap-1.5">
        <input
          id={`m-${f.item_id}`} inputMode="decimal" value={valor} disabled={locked}
          onChange={e => onChange(e.target.value)}
          placeholder={f.device_value ?? '—'}
          className={`w-24 rounded-lg border px-2.5 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 disabled:bg-slate-50 disabled:text-slate-400 ${
            alterado
              ? 'border-amber-300 bg-amber-50 text-amber-900 focus:border-amber-500 focus:ring-amber-500'
              : 'border-slate-200 text-slate-800 focus:border-teal-500 focus:ring-teal-500'
          }`}
        />
        <span className="w-16 text-xs text-slate-400">{f.unit ?? ''}</span>
      </div>

      <span className="w-40 text-right text-xs text-slate-400">{f.ref ?? ''}</span>

      {/* Linha que o aparelho mede e a clínica pode corrigir: mostra o original. */}
      {f.device_value !== null && (
        <span className={`text-[11px] ${alterado ? 'text-amber-700' : 'text-slate-400'}`}>
          aparelho: {f.device_value}{alterado ? ' · corrigido' : ''}
        </span>
      )}
    </div>
  )
}
