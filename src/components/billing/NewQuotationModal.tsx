'use client'

/**
 * Novo Orçamento de Serviços (O.S.) — Fase 1.
 * Reusa searchTutorsAndPatients (tutor/pet) e searchServices (catálogo).
 * Itens editáveis (qtd/preço), formas de pagamento/descontos/observações,
 * total ao vivo. Pergunta de NFS-e fica oculta na Fase 1 (até a Fase 3).
 */

import { useState, useRef } from 'react'
import {
  X, Search, Plus, Minus, Trash2, Loader2, UserCircle, PawPrint, FileText,
} from 'lucide-react'
import { searchTutorsAndPatients, type SearchResult } from '@/lib/actions/tutors'
import { searchServices, type ServiceItem } from '@/lib/actions/services'
import { createQuotation } from '@/lib/actions/billing-documents'

interface Props {
  clinicId:      string
  currentUserId: string
  professionals: Array<{ id: string; name: string; role: string }>
  onClose:   () => void
  onCreated: (id: string) => void
}

interface Line {
  key:           string
  stock_item_id: string | null
  description:   string
  quantity:      number
  unit_price:    number
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function NewQuotationModal({ clinicId, currentUserId, professionals, onClose, onCreated }: Props) {
  // tutor/pet
  const [tutorQuery, setTutorQuery] = useState('')
  const [tutorResults, setTutorResults] = useState<SearchResult[]>([])
  const [tutor, setTutor] = useState<{ id: string; name: string } | null>(null)
  const [petOptions, setPetOptions] = useState<Array<{ id: string; name: string }>>([])
  const [petId, setPetId] = useState('')
  const tutorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // serviços
  const [svcQuery, setSvcQuery] = useState('')
  const [svcResults, setSvcResults] = useState<ServiceItem[]>([])
  const [svcSearching, setSvcSearching] = useState(false)
  const svcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [lines, setLines] = useState<Line[]>([])
  const [professionalId, setProfessionalId] = useState(currentUserId)
  const [validUntil, setValidUntil] = useState('')
  const [paymentMethods, setPaymentMethods] = useState('')
  const [discountNote, setDiscountNote] = useState('')
  const [observations, setObservations] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)

  function handleTutorQuery(q: string) {
    setTutorQuery(q)
    if (tutorTimer.current) clearTimeout(tutorTimer.current)
    if (q.trim().length < 2) { setTutorResults([]); return }
    tutorTimer.current = setTimeout(async () => {
      const r = await searchTutorsAndPatients(q)
      setTutorResults(Array.isArray(r) ? r : [])
    }, 300)
  }

  function pickTutor(res: SearchResult) {
    setTutor({ id: res.tutor.id, name: res.tutor.name ?? 'Tutor' })
    setPetOptions(res.patients.map(p => ({ id: p.id, name: p.name })))
    setPetId(res.patients.length === 1 ? res.patients[0].id : '')
    setTutorResults([])
    setTutorQuery(res.tutor.name ?? '')
  }

  function handleSvcQuery(q: string) {
    setSvcQuery(q)
    if (svcTimer.current) clearTimeout(svcTimer.current)
    svcTimer.current = setTimeout(async () => {
      setSvcSearching(true)
      const r = await searchServices(q)
      setSvcSearching(false)
      setSvcResults(Array.isArray(r) ? r : [])
    }, 250)
  }

  function addService(s: ServiceItem) {
    setLines(prev => {
      const existing = prev.find(l => l.stock_item_id === s.id)
      if (existing) return prev.map(l => l.stock_item_id === s.id ? { ...l, quantity: l.quantity + 1 } : l)
      return [...prev, { key: crypto.randomUUID(), stock_item_id: s.id, description: s.name, quantity: 1, unit_price: s.unit_price }]
    })
    setSvcQuery(''); setSvcResults([])
  }

  function addManualLine() {
    setLines(prev => [...prev, { key: crypto.randomUUID(), stock_item_id: null, description: '', quantity: 1, unit_price: 0 }])
  }
  function updateLine(key: string, patch: Partial<Line>) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  }
  function removeLine(key: string) { setLines(prev => prev.filter(l => l.key !== key)) }

  async function handleSave() {
    setError(null)
    const clean = lines.filter(l => l.description.trim() && Number(l.quantity) > 0)
    if (clean.length === 0) { setError('Adicione ao menos um serviço/item.'); return }
    setSaving(true)
    const res = await createQuotation({
      tutor_id:        tutor?.id ?? null,
      patient_id:      petId || null,
      professional_id: professionalId || null,
      valid_until:     validUntil || null,
      items: clean.map(l => ({ stock_item_id: l.stock_item_id, description: l.description.trim(), quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
      payload: {
        payment_methods: paymentMethods.trim() || undefined,
        discount_note:   discountNote.trim() || undefined,
        observations:    observations.trim() || undefined,
      },
    })
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    onCreated(res.id)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-4 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-green-50/40 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600"><FileText className="h-5 w-5 text-white" /></div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Novo Orçamento de Serviços</h2>
              <p className="text-[11px] text-slate-500">Sem compromisso — pode enviar ao tutor e faturar depois</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Tutor + Pet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><UserCircle className="h-3 w-3" /> Tutor (opcional)</span>
              {tutor ? (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                  <span className="flex-1 text-sm font-semibold text-blue-800 truncate">{tutor.name}</span>
                  <button onClick={() => { setTutor(null); setPetOptions([]); setPetId(''); setTutorQuery('') }} className="text-blue-400 hover:text-blue-600"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input value={tutorQuery} onChange={e => handleTutorQuery(e.target.value)} placeholder="CPF, nome do tutor ou pet" className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
                  </div>
                  {tutorResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                      {tutorResults.map(r => (
                        <button key={r.tutor.id} onClick={() => pickTutor(r)} className="w-full text-left px-3 py-2 hover:bg-green-50 border-b border-slate-100 last:border-0">
                          <p className="text-sm font-semibold text-slate-800">{r.tutor.name}</p>
                          <p className="text-xs text-slate-400">{r.patients.map(p => p.name).join(', ') || 'sem pets'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><PawPrint className="h-3 w-3" /> Pet (opcional)</span>
              <select value={petId} onChange={e => setPetId(e.target.value)} disabled={petOptions.length === 0} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20">
                <option value="">{petOptions.length ? '— Selecionar —' : 'Selecione o tutor primeiro'}</option>
                {petOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Profissional + validade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Profissional</span>
              <select value={professionalId} onChange={e => setProfessionalId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20">
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Válido até (opcional)</span>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            </div>
          </div>

          {/* Busca de serviço */}
          <div className="relative">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Serviços / Itens</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={svcQuery} onChange={e => handleSvcQuery(e.target.value)} onFocus={() => svcQuery.length < 2 && handleSvcQuery(svcQuery)} placeholder="Buscar serviço no catálogo..." className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            </div>
            {(svcSearching || svcResults.length > 0) && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                {svcSearching ? (
                  <div className="px-3 py-2.5 text-xs text-slate-400 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...</div>
                ) : svcResults.map(s => (
                  <button key={s.id} onClick={() => addService(s)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-green-50 border-b border-slate-100 last:border-0">
                    <span className="text-sm text-slate-700 truncate">{s.name}</span>
                    <span className="text-sm font-semibold text-slate-900 ml-3 flex-shrink-0">{fmt(s.unit_price)}</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={addManualLine} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-green-700">
              <Plus className="h-3 w-3" /> Adicionar item manual
            </button>
          </div>

          {/* Linhas */}
          {lines.length > 0 && (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {lines.map(l => (
                <div key={l.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <input value={l.description} onChange={e => updateLine(l.key, { description: e.target.value })} placeholder="Descrição" className="flex-1 min-w-[120px] basis-40 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/30" />
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateLine(l.key, { quantity: Math.max(1, l.quantity - 1) })} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Minus className="h-3.5 w-3.5" /></button>
                    <input type="number" min="0" step="0.001" value={l.quantity} onChange={e => updateLine(l.key, { quantity: parseFloat(e.target.value) || 0 })} className="w-12 text-center rounded-lg border border-slate-200 px-1 py-1 text-sm tabular-nums" />
                    <button onClick={() => updateLine(l.key, { quantity: l.quantity + 1 })} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400">R$</span>
                    <input type="number" min="0" step="0.01" value={l.unit_price} onChange={e => updateLine(l.key, { unit_price: parseFloat(e.target.value) || 0 })} className="w-20 text-right rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums" />
                  </div>
                  <span className="w-20 text-right text-sm font-semibold text-slate-900 tabular-nums">{fmt(l.quantity * l.unit_price)}</span>
                  <button onClick={() => removeLine(l.key)} className="rounded p-1 text-rose-400 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Condições */}
          <div className="grid grid-cols-1 gap-2">
            <input value={paymentMethods} onChange={e => setPaymentMethods(e.target.value)} placeholder="Formas de pagamento (ex.: PIX, cartão 3x...)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            <input value={discountNote} onChange={e => setDiscountNote(e.target.value)} placeholder="Descontos (opcional)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} placeholder="Observações (opcional)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20" />
          </div>

          {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total</p>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{fmt(total)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving || lines.length === 0} className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : <>Criar Orçamento</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
