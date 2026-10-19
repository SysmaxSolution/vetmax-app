'use client'

// Endereçamento de prateleira e parâmetros de compra (Fase 4 · item 4.4).
//
// Tabela editável em linha, de propósito: a tarefa é de prateleira — quem
// organiza o estoque percorre a estante e endereça vários itens em sequência.
// Abrir o cadastro completo de cada item para preencher dois campos faria
// ninguém endereçar nada, e sem endereço o resto do 4.4 não serve para achar
// material.

import { useCallback, useEffect, useState } from 'react'
import { MapPin, Loader2, Check, Search, Plus, Ban } from 'lucide-react'
import {
  listItensParaEnderecar, listLocaisDeEstoque, salvarLocalDeEstoque, salvarEnderecoEParametros,
} from '@/lib/actions/stock-reposicao'
import type { ItemEnderecavel, LocalDeEstoque } from '@/types/estoque-reposicao'

const num = (t: string): number | null => {
  const v = String(t).trim()
  if (v === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export default function EnderecamentoPanel({ onToast }: { onToast: (t: 'ok' | 'erro', m: string) => void }) {
  const [itens, setItens]           = useState<ItemEnderecavel[]>([])
  const [locais, setLocais]         = useState<LocalDeEstoque[]>([])
  const [busca, setBusca]           = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [salvoId, setSalvoId]       = useState<string | null>(null)
  const [novoLocal, setNovoLocal]   = useState('')
  const [rascunho, setRascunho]     = useState<Record<string, Partial<ItemEnderecavel>>>({})

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [i, l] = await Promise.all([listItensParaEnderecar(busca), listLocaisDeEstoque()])
    setCarregando(false)
    if (Array.isArray(i)) setItens(i)
    else onToast('erro', i.error)
    if (Array.isArray(l)) setLocais(l)
  }, [busca, onToast])

  useEffect(() => {
    const t = setTimeout(() => { void carregar() }, 250)
    return () => clearTimeout(t)
  }, [carregar])

  function valor<K extends keyof ItemEnderecavel>(item: ItemEnderecavel, campo: K): ItemEnderecavel[K] {
    const r = rascunho[item.id]
    return (r && campo in r ? r[campo] : item[campo]) as ItemEnderecavel[K]
  }

  function editar(id: string, patch: Partial<ItemEnderecavel>) {
    setRascunho(s => ({ ...s, [id]: { ...(s[id] ?? {}), ...patch } }))
  }

  async function salvar(item: ItemEnderecavel) {
    const r = rascunho[item.id]
    if (!r) return
    setSalvandoId(item.id)
    const res = await salvarEnderecoEParametros({
      stockItemId:      item.id,
      locationId:       r.location_id !== undefined ? r.location_id : undefined,
      shelfCode:        r.shelf_code !== undefined ? r.shelf_code : undefined,
      leadTimeDays:     r.lead_time_days !== undefined ? r.lead_time_days : undefined,
      coverageDays:     r.coverage_days !== undefined ? r.coverage_days : undefined,
      purchaseMultiple: r.purchase_multiple !== undefined ? r.purchase_multiple : undefined,
      purchaseMinimum:  r.purchase_minimum !== undefined ? r.purchase_minimum : undefined,
      returnable:       r.returnable !== undefined ? r.returnable : undefined,
    })
    setSalvandoId(null)
    if ('error' in res) { onToast('erro', res.error); return }

    setItens(lista => lista.map(i => i.id === item.id ? { ...i, ...r } : i))
    setRascunho(s => { const c = { ...s }; delete c[item.id]; return c })
    setSalvoId(item.id)
    setTimeout(() => setSalvoId(null), 2000)
  }

  async function criarLocal() {
    const nome = novoLocal.trim()
    if (!nome) return
    const res = await salvarLocalDeEstoque({ name: nome })
    if ('error' in res) { onToast('erro', res.error); return }
    setNovoLocal('')
    onToast('ok', `Local "${nome}" criado.`)
    void carregar()
  }

  return (
    <div className="space-y-4">
      {/* Locais de armazenagem */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-2">
          <MapPin className="h-3 w-3" /> Locais de armazenagem
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {locais.map(l => (
            <span key={l.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
              {l.name}
              <span className="text-slate-400">{l.itens}</span>
            </span>
          ))}
          <div className="inline-flex items-center gap-1">
            <input
              value={novoLocal}
              onChange={e => setNovoLocal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void criarLocal() }}
              placeholder="Estoque central, farmácia da sala…"
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-teal-500/20 w-56"
            />
            <button onClick={criarLocal} disabled={!novoLocal.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              <Plus className="h-3 w-3" /> Novo
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          O local e o endereço dizem <strong>onde achar</strong> o material. O saldo continua único por item —
          separar saldo por local muda a apuração do estoque inteiro e depende de decisão do cliente.
        </p>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, código de barras ou endereço…"
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>

      {/* Tabela editável */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {carregando ? (
          <div className="px-6 py-12 flex items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : itens.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            {busca.trim() ? 'Nenhum item encontrado.' : 'Nenhum produto cadastrado no estoque.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2 font-semibold">Item</th>
                  <th className="px-2 py-2 font-semibold">Local</th>
                  <th className="px-2 py-2 font-semibold">Prateleira</th>
                  <th className="px-2 py-2 font-semibold text-right" title="Prazo de entrega do fornecedor">Entrega</th>
                  <th className="px-2 py-2 font-semibold text-right" title="Dias de consumo que a compra deve cobrir">Cobertura</th>
                  <th className="px-2 py-2 font-semibold text-right" title="Embalagem fechada">Múltiplo</th>
                  <th className="px-2 py-2 font-semibold text-center" title="Volta ao estoque depois de aberto?">Retorna</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {itens.map(item => {
                  const sujo = Boolean(rascunho[item.id])
                  return (
                    <tr key={item.id} className={sujo ? 'bg-amber-50/40' : undefined}>
                      <td className="px-4 py-2">
                        <span className="text-slate-800">{item.name}</span>
                        {item.is_controlled && (
                          <span className="ml-1.5 text-[9px] font-bold uppercase text-blue-700 bg-blue-50 border border-blue-200 rounded px-1 py-0.5">
                            controlado
                          </span>
                        )}
                        <span className="block text-[11px] text-slate-400">
                          saldo {item.quantity} {item.unit ?? ''}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={valor(item, 'location_id') ?? ''}
                          onChange={e => editar(item.id, { location_id: e.target.value || null })}
                          className="px-2 py-1 border border-slate-300 rounded text-xs outline-none focus:ring-2 focus:ring-teal-500/20 w-36"
                        >
                          <option value="">—</option>
                          {locais.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={valor(item, 'shelf_code') ?? ''}
                          onChange={e => editar(item.id, { shelf_code: e.target.value })}
                          placeholder="A-3-2"
                          className="w-20 px-2 py-1 border border-slate-300 rounded text-xs outline-none focus:ring-2 focus:ring-teal-500/20"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          value={valor(item, 'lead_time_days') ?? ''}
                          onChange={e => editar(item.id, { lead_time_days: num(e.target.value) })}
                          inputMode="numeric" placeholder="dias"
                          className="w-14 px-2 py-1 border border-slate-300 rounded text-xs text-right outline-none focus:ring-2 focus:ring-teal-500/20"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          value={valor(item, 'coverage_days') ?? ''}
                          onChange={e => editar(item.id, { coverage_days: num(e.target.value) })}
                          inputMode="numeric" placeholder="dias"
                          className="w-14 px-2 py-1 border border-slate-300 rounded text-xs text-right outline-none focus:ring-2 focus:ring-teal-500/20"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          value={valor(item, 'purchase_multiple') ?? ''}
                          onChange={e => editar(item.id, { purchase_multiple: num(e.target.value) })}
                          inputMode="decimal" placeholder="caixa"
                          className="w-16 px-2 py-1 border border-slate-300 rounded text-xs text-right outline-none focus:ring-2 focus:ring-teal-500/20"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => editar(item.id, { returnable: !valor(item, 'returnable') })}
                          title={valor(item, 'returnable')
                            ? 'Volta ao estoque se não for usado'
                            : 'Depois de aberto não volta — vira perda na conferência do kit'}
                          className={`inline-flex items-center justify-center h-6 w-6 rounded border ${
                            valor(item, 'returnable')
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-rose-50 border-rose-200 text-rose-700'
                          }`}
                        >
                          {valor(item, 'returnable') ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {sujo ? (
                          <button
                            onClick={() => salvar(item)}
                            disabled={salvandoId === item.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {salvandoId === item.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Check className="h-3 w-3" />}
                            Salvar
                          </button>
                        ) : salvoId === item.id ? (
                          <span className="text-[11px] text-emerald-600 font-medium">salvo</span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
