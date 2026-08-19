'use client'

import { useState, useTransition } from 'react'
import { X, Sparkles, Loader2, AlertCircle, Check } from 'lucide-react'
import type { StockItemV2 } from '@/lib/actions/stock'
import { updateStockItemV2 } from '@/lib/actions/stock'
import { enrichProductFromNCM } from '@/lib/actions/purchases'

interface Props {
  item:    StockItemV2
  onClose: () => void
  onSaved: (updated: StockItemV2) => void
}

const INPUT = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-400 focus:outline-none'

export function EnrichNcmModal({ item, onClose, onSaved }: Props) {
  const [ncm,         setNcm]         = useState((item as any).ncm ?? '')
  const [barcode,     setBarcode]     = useState(item.barcode ?? '')
  const [ncmDesc,     setNcmDesc]     = useState((item as any).ncm_description ?? '')
  const [cfop,        setCfop]        = useState((item as any).cfop ?? '')
  const [lookupMsg,   setLookupMsg]   = useState<string | null>(null)
  const [lookupOk,    setLookupOk]    = useState(false)
  const [isFetching,  setIsFetching]  = useState(false)
  const [isPending,   startTransition] = useTransition()
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)

  async function handleLookup() {
    const clean = ncm.replace(/\D/g, '')
    if (clean.length !== 8) { setLookupMsg('NCM deve ter 8 dígitos.'); return }
    setIsFetching(true)
    setLookupMsg(null)
    const res = await enrichProductFromNCM(clean)
    setIsFetching(false)
    if ('error' in res) {
      setLookupMsg(res.error)
      setLookupOk(false)
    } else {
      setNcmDesc(res.description)
      setNcm(res.code)
      setLookupMsg(`✓ ${res.description}`)
      setLookupOk(true)
    }
  }

  function handleSave() {
    startTransition(async () => {
      setErrorMsg(null)
      const res = await updateStockItemV2(item.id, {
        barcode:         barcode.trim() || null,
        ...({ ncm: ncm.trim() || null } as any),
        ...({ ncm_description: ncmDesc.trim() || null } as any),
        ...({ cfop: cfop.trim() || null } as any),
      })
      if ('error' in res) { setErrorMsg(res.error); return }
      onSaved(res)
    })
  }

  const needsEnrich = !(item as any).ncm && !item.barcode

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-600" />
            <div>
              <h2 className="font-bold text-slate-800 text-sm">Enriquecer Dados Fiscais</h2>
              <p className="text-xs text-slate-400 truncate max-w-[240px]">{item.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {needsEnrich && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Este produto não possui NCM ou EAN cadastrado.
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4" />
              {errorMsg}
            </div>
          )}

          {/* NCM */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">NCM (8 dígitos)</label>
            <div className="flex gap-2">
              <input
                value={ncm}
                onChange={e => setNcm(e.target.value.replace(/\D/g, '').substring(0, 8))}
                className={`${INPUT} font-mono`}
                placeholder="00000000"
                maxLength={8}
              />
              <button
                type="button"
                onClick={handleLookup}
                disabled={isFetching || ncm.replace(/\D/g,'').length !== 8}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-40 whitespace-nowrap"
              >
                {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Buscar
              </button>
            </div>
            {lookupMsg && (
              <p className={`mt-1.5 text-xs ${lookupOk ? 'text-teal-700' : 'text-red-600'}`}>
                {lookupMsg}
              </p>
            )}
          </div>

          {/* Descrição NCM (auto-preenchida) */}
          {ncmDesc && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Descrição NCM</label>
              <input value={ncmDesc} onChange={e => setNcmDesc(e.target.value)} className={INPUT} />
            </div>
          )}

          {/* EAN / Barcode */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">EAN / Código de Barras</label>
            <input
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              className={`${INPUT} font-mono`}
              placeholder="7891000000000"
            />
          </div>

          {/* CFOP */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">CFOP padrão (opcional)</label>
            <input
              value={cfop}
              onChange={e => setCfop(e.target.value)}
              className={INPUT}
              placeholder="5102"
              maxLength={5}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Salvar Dados
          </button>
        </div>
      </div>
    </div>
  )
}
