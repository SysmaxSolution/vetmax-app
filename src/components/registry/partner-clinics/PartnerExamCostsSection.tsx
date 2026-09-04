'use client'

import { useState, useEffect } from 'react'
import { FlaskConical, Loader2, Check } from 'lucide-react'
import { listPartnerExamCosts, upsertPartnerExamCost, type PartnerExamCost } from '@/lib/actions/partner-clinics'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// F1 do pagamento de laboratórios: custo a pagar ao laboratório por exame do
// catálogo (o preço ao tutor vem do catálogo; aqui é o custo do lab).
export default function PartnerExamCostsSection({ partnerClinicId }: { partnerClinicId: string }) {
  const [rows, setRows]     = useState<PartnerExamCost[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved]   = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    listPartnerExamCosts(partnerClinicId).then(r => {
      if (Array.isArray(r)) {
        setRows(r)
        setDrafts(Object.fromEntries(r.map(x => [x.catalog_item_id, x.cost ? x.cost.toFixed(2).replace('.', ',') : ''])))
      }
      setLoading(false)
    })
  }, [partnerClinicId])

  async function save(itemId: string) {
    const raw = (drafts[itemId] ?? '').replace(',', '.')
    const cost = parseFloat(raw)
    if (!Number.isFinite(cost) || cost < 0) return
    const res = await upsertPartnerExamCost({ partner_clinic_id: partnerClinicId, catalog_item_id: itemId, cost })
    if (!('error' in res)) {
      setRows(prev => prev.map(r => r.catalog_item_id === itemId ? { ...r, cost } : r))
      setSaved(itemId); setTimeout(() => setSaved(s => s === itemId ? null : s), 1200)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="h-4 w-4 text-teal-600" />
        <span className="text-sm font-medium text-slate-700">Custos de exames (laboratório)</span>
      </div>
      <p className="text-xs text-slate-500 mb-2">Valor que <strong>pagamos a este laboratório</strong> por exame. O preço cobrado do tutor vem do catálogo.</p>
      {loading ? (
        <div className="py-3 flex items-center gap-2 text-slate-400 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Carregando exames…</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-amber-600 py-2">Nenhum exame no catálogo. Cadastre exames (item do tipo &quot;exame&quot;) na Precificação/Catálogo para vincular o custo.</p>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-slate-400 uppercase px-1">
            <span className="col-span-6">Exame</span>
            <span className="col-span-3 text-right">Preço tutor</span>
            <span className="col-span-3 text-right">Custo lab (R$)</span>
          </div>
          {rows.map(r => (
            <div key={r.catalog_item_id} className="grid grid-cols-12 gap-2 items-center">
              <span className="col-span-6 text-sm text-slate-700 truncate">{r.name}</span>
              <span className="col-span-3 text-right text-xs text-slate-500 tabular-nums">{fmt(r.sale_price)}</span>
              <div className="col-span-3 relative">
                <input
                  value={drafts[r.catalog_item_id] ?? ''}
                  onChange={e => setDrafts(d => ({ ...d, [r.catalog_item_id]: e.target.value }))}
                  onBlur={() => save(r.catalog_item_id)}
                  inputMode="decimal" placeholder="0,00"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-right tabular-nums focus:border-teal-500 focus:outline-none"
                />
                {saved === r.catalog_item_id && <Check className="h-3.5 w-3.5 text-emerald-600 absolute -right-5 top-1/2 -translate-y-1/2" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
