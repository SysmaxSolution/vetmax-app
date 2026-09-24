'use client'

import { useState, useEffect, useRef } from 'react'
import { Gift, Search, Plus, Loader2, Dog } from 'lucide-react'
import { listCatalogPackages, type CatalogPackage } from '@/lib/actions/packages'
import { getPatientsList, type PatientsListItem } from '@/lib/actions/timeline'
import type { CartItem } from './SalesCart'

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶', cat: '🐱', bird: '🐦', rabbit: '🐰',
  rodent: '🐹', reptile: '🦎', exotic: '🦜', fish: '🐟',
}

interface Props {
  selectedPet:    PatientsListItem | null
  onSelectPet:    (pet: PatientsListItem | null) => void
  onAdd:          (item: CartItem) => void
}

export default function PackagePDVSearch({ selectedPet, onSelectPet, onAdd }: Props) {
  const [packages,     setPackages]     = useState<CatalogPackage[]>([])
  const [loading,      setLoading]      = useState(true)
  const [petQuery,     setPetQuery]     = useState('')
  const [petResults,   setPetResults]   = useState<PatientsListItem[]>([])
  const [petSearching, setPetSearching] = useState(false)
  const [petOpen,      setPetOpen]      = useState(false)
  const [pkgQuery,     setPkgQuery]     = useState('')
  const petTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    listCatalogPackages().then(res => {
      setLoading(false)
      if (Array.isArray(res)) setPackages(res.filter(p => p.active))
    })
  }, [])

  function handlePetChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setPetQuery(q)
    if (petTimer.current) clearTimeout(petTimer.current)
    if (q.trim().length < 2) { setPetResults([]); setPetOpen(false); return }
    setPetSearching(true)
    petTimer.current = setTimeout(async () => {
      const res = await getPatientsList(q.trim())
      setPetSearching(false)
      if (Array.isArray(res)) { setPetResults(res); setPetOpen(res.length > 0) }
    }, 300)
  }

  function pickPet(p: PatientsListItem) {
    onSelectPet(p)
    setPetQuery('')
    setPetResults([])
    setPetOpen(false)
  }

  function addPackage(pkg: CatalogPackage) {
    onAdd({
      key:           crypto.randomUUID(),
      stock_item_id: null,
      package_id:    pkg.id,
      description:   pkg.name,
      unit_price:    pkg.price,
      quantity:      1,
      discount:      0,
    })
  }

  const filtered = packages.filter(p =>
    p.name.toLowerCase().includes(pkgQuery.toLowerCase())
  )

  return (
    <div className="space-y-3">
      {/* Seletor de Pet */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
          <Dog className="h-3.5 w-3.5" /> Animal que receberá o pacote *
        </label>

        {selectedPet ? (
          <div className="flex items-center gap-2 bg-teal-50 border border-teal-300 rounded-xl px-3 py-2">
            <span className="text-lg">{SPECIES_EMOJI[selectedPet.species] ?? '🐾'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-teal-800 truncate">{selectedPet.name}</p>
              <p className="text-xs text-teal-600">{selectedPet.tutor.name}</p>
            </div>
            <button
              type="button"
              onClick={() => onSelectPet(null)}
              className="text-teal-400 hover:text-teal-600 text-xs font-medium"
            >
              Trocar
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            {petSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />}
            <input
              type="text"
              placeholder="Buscar animal (nome ou tutor)…"
              value={petQuery}
              onChange={handlePetChange}
              onFocus={() => petResults.length > 0 && setPetOpen(true)}
              onBlur={() => setTimeout(() => setPetOpen(false), 150)}
              className="w-full border border-slate-300 rounded-lg pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {petOpen && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {petResults.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => pickPet(p)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-teal-50 border-b border-slate-100 last:border-0 transition-colors"
                  >
                    <span className="text-lg shrink-0">{SPECIES_EMOJI[p.species] ?? '🐾'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 truncate">{p.tutor.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Busca de pacotes */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
          <Gift className="h-3.5 w-3.5" /> Pacote / Plano
        </label>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filtrar pacotes…"
            value={pkgQuery}
            onChange={e => setPkgQuery(e.target.value)}
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Nenhum pacote ativo.</p>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {filtered.map(pkg => (
              <div key={pkg.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                <Gift className="h-4 w-4 text-teal-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{pkg.name}</p>
                  <p className="text-xs text-slate-400">{pkg.total_sessions} sessões · a cada {pkg.interval_days}d</p>
                </div>
                <span className="text-sm font-bold text-teal-700 shrink-0 font-mono tabular-nums">
                  R$ {pkg.price.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => addPackage(pkg)}
                  disabled={!selectedPet}
                  title={!selectedPet ? 'Selecione o animal primeiro' : ''}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-colors disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
