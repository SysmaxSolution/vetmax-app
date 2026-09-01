'use client'

// Lançamento de ADIANTAMENTO no Caixa (Sprint Animais, Fase 1, 1.6).
// Cliente deixa um valor que vira crédito para uso futuro. Entra no Caixa agora
// e credita o tutor (razão tutor_credits). O uso do crédito é no recebimento.

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Wallet, Search } from 'lucide-react'
import { searchTutorsAndPatients, type SearchResult } from '@/lib/actions/tutors'
import { addTutorAdvance, getTutorCreditBalance } from '@/lib/actions/tutor-credits'
import { listActiveCompanies } from '@/lib/actions/companies'
import { useAnimaisFoundation } from '@/components/providers/ClinicConfigProvider'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'debit', label: 'Cartão Débito' },
  { value: 'credit', label: 'Cartão Crédito' },
]

interface Props {
  onClose: () => void
  onSuccess: () => void
  onToast: (msg: string, type: 'success' | 'error') => void
}

export default function AdvanceModal({ onClose, onSuccess, onToast }: Props) {
  const animais = useAnimaisFoundation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [tutor, setTutor] = useState<{ id: string; name: string } | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [companies, setCompanies] = useState<{ id: string; code: string; name: string; is_default: boolean }[]>([])
  const [companyId, setCompanyId] = useState('')
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!animais) return
    listActiveCompanies().then(cs => {
      setCompanies(cs)
      const def = cs.find(c => c.is_default) ?? cs[0]
      if (def) setCompanyId(def.id)
    })
  }, [animais])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (query.trim().length < 2 || tutor) { setResults([]); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      const res = await searchTutorsAndPatients(query.trim())
      setSearching(false)
      if (Array.isArray(res)) setResults(res)
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [query, tutor])

  async function pickTutor(t: { id: string; name: string | null }) {
    setTutor({ id: t.id, name: t.name ?? 'Tutor' })
    setResults([])
    const b = await getTutorCreditBalance(t.id)
    if (!('error' in b)) setBalance(b.total)
  }

  async function handleSubmit() {
    if (!tutor) { onToast('Selecione o tutor.', 'error'); return }
    const val = Number(amount.replace(',', '.'))
    if (!Number.isFinite(val) || val <= 0) { onToast('Informe um valor válido.', 'error'); return }
    setSaving(true)
    const res = await addTutorAdvance({
      tutor_id: tutor.id,
      amount: val,
      company_id: animais && companyId ? companyId : null,
      payment_method: method,
      notes: notes.trim() || undefined,
    })
    setSaving(false)
    if ('error' in res) { onToast(res.error, 'error'); return }
    onToast(`Adiantamento de R$ ${val.toFixed(2)} lançado para ${tutor.name}.`, 'success')
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-xl animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100"><Wallet className="h-5 w-5 text-teal-700" /></div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Lançar Adiantamento</h2>
              <p className="text-xs text-slate-500">Crédito do tutor para uso futuro — entra no caixa agora</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Tutor */}
          {!tutor ? (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tutor</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome ou CPF…"
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
              </div>
              {searching && <p className="mt-1 text-[11px] text-slate-400">Buscando…</p>}
              {results.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {results.map(r => (
                    <button key={r.tutor.id} type="button" onClick={() => pickTutor(r.tutor)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                      <span className="font-medium text-slate-800">{r.tutor.name ?? '—'}</span>
                      {r.tutor.cpf && <span className="ml-2 text-xs text-slate-400">{r.tutor.cpf}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">{tutor.name}</p>
                {balance != null && <p className="text-[11px] text-slate-500">Crédito atual: R$ {balance.toFixed(2)}</p>}
              </div>
              <button onClick={() => { setTutor(null); setBalance(null); setQuery('') }} className="text-xs font-semibold text-teal-700 hover:text-teal-900">Trocar</button>
            </div>
          )}

          {/* Valor + forma */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Valor (R$)</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Forma</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20">
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* Empresa (multi-CNPJ) */}
          {animais && companies.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Empresa (onde o crédito fica)</label>
              <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20">
                {companies.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Observação (opcional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex.: adiantamento p/ castração"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4 bg-slate-50">
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || !tutor}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Lançar adiantamento
          </button>
        </div>
      </div>
    </div>
  )
}
