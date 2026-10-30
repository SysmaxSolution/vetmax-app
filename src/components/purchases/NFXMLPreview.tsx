'use client'

import { useState } from 'react'
import type { ParsedNFe } from '@/lib/utils/nfe-parser'
import type { AjustesDaEntrada, AjusteDeItem } from '@/types/entrada-mercadoria'
import { Building2, Package, FileText, Trash2, RotateCcw, Percent, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  parsed: ParsedNFe
  /**
   * Quando `onAjustar` vem, a conferência fica editável.
   *
   * A nota do fornecedor nem sempre bate com o que chegou: faltou uma caixa, o
   * preço foi renegociado, a descrição veio impossível de achar no estoque.
   * Sem corrigir aqui, o operador dá entrada errado e conserta depois — ou não
   * conserta.
   */
  ajustes?:   AjustesDaEntrada
  onAjustar?: (a: AjustesDaEntrada) => void
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const r2 = (v: number) => Number(v.toFixed(2))
const r4 = (v: number) => Number(v.toFixed(4))

/** Campos fiscais editáveis por item, na ordem em que aparecem na tela. */
const CAMPOS_FISCAIS: Array<{ key: keyof AjusteDeItem; label: string; tipo: 'texto' | 'numero'; dica?: string }> = [
  { key: 'cfop',         label: 'CFOP',        tipo: 'texto',  dica: 'CFOP do fornecedor. A entrada é lançada com o correspondente (5102 → 1102, 6102 → 2102).' },
  { key: 'cst',          label: 'CST/CSOSN',   tipo: 'texto',  dica: 'Situação tributária do ICMS' },
  { key: 'tax_icms',     label: 'ICMS %',      tipo: 'numero' },
  { key: 'icms_base',    label: 'Base ICMS',   tipo: 'numero' },
  { key: 'icms_value',   label: 'Valor ICMS',  tipo: 'numero' },
  { key: 'ipi_value',    label: 'IPI',         tipo: 'numero' },
  { key: 'pis_value',    label: 'PIS',         tipo: 'numero' },
  { key: 'cofins_value', label: 'COFINS',      tipo: 'numero' },
]

export function NFXMLPreview({ parsed, ajustes, onAjustar }: Props) {
  const { supplier, items, nfe_number, nfe_series, issue_date, total_value } = parsed

  const editavel = typeof onAjustar === 'function'
  const porIndice = new Map((ajustes?.itens ?? []).map(a => [a.indice, a]))
  const [impostosAbertos, setImpostosAbertos] = useState<Set<number>>(new Set())

  /** Guarda a correção do item, preservando o que já havia sido ajustado nele. */
  function mudar(indice: number, patch: Partial<AjusteDeItem>) {
    if (!onAjustar) return
    const atuais = ajustes?.itens ?? []
    const existente = atuais.find(x => x.indice === indice)
    const novo: AjusteDeItem = { ...(existente ?? { indice }), ...patch, indice }
    onAjustar({ ...ajustes, itens: [...atuais.filter(x => x.indice !== indice), novo] })
  }

  /** Valores em vigor do item (o que o operador vê e o que vai entrar). */
  function emVigor(i: number) {
    const item = items[i]
    const a = porIndice.get(i)
    const qtd  = a?.quantity ?? item.quantity
    const unit = a?.unit_price ?? item.unit_price
    const tot  = a?.total_price ?? r2(qtd * unit)
    return { item, a, qtd, unit, tot, fora: a?.excluir === true }
  }

  // Regra do dinheiro: o fornecedor cobrou o TOTAL do item. Mudar a
  // quantidade é reembalagem (50 caixas de 2 → 100 unidades): o total fica e o
  // unitário é recalculado. Mudar o unitário ou o total recalcula o outro.
  function mudarQuantidade(i: number, valor: string) {
    if (valor === '') { mudar(i, { quantity: undefined }); return }
    const qtd = Number(valor)
    if (!Number.isFinite(qtd) || qtd < 0) return
    const { tot } = emVigor(i)
    mudar(i, { quantity: qtd, total_price: tot, unit_price: qtd > 0 ? r4(tot / qtd) : undefined })
  }
  function mudarUnitario(i: number, valor: string) {
    if (valor === '') { mudar(i, { unit_price: undefined }); return }
    const unit = Number(valor)
    if (!Number.isFinite(unit) || unit < 0) return
    const { qtd } = emVigor(i)
    mudar(i, { unit_price: unit, total_price: r2(qtd * unit) })
  }
  function mudarTotal(i: number, valor: string) {
    if (valor === '') { mudar(i, { total_price: undefined }); return }
    const tot = Number(valor)
    if (!Number.isFinite(tot) || tot < 0) return
    const { qtd } = emVigor(i)
    mudar(i, { total_price: tot, unit_price: qtd > 0 ? r4(tot / qtd) : undefined })
  }

  function toggleImpostos(i: number) {
    setImpostosAbertos(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  // O total que vale é o do que REALMENTE entrou.
  const totalAjustado = items.reduce((soma, _item, i) => {
    const { fora, tot } = emVigor(i)
    return fora ? soma : soma + tot
  }, 0)
  const mudouTotal = Math.round(totalAjustado * 100) !== Math.round(total_value * 100)
  const temImposto = items.some(it => it.cfop || it.cst || it.icms_value || it.ipi_value || it.pis_value || it.cofins_value)

  return (
    <div className="space-y-5">
      {/* NF-e header */}
      <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-purple-600" />
          <span className="font-semibold text-purple-900 text-sm">Dados da NF-e</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Número</p>
            <p className="font-medium text-slate-800">{nfe_number || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Série</p>
            <p className="font-medium text-slate-800">{nfe_series || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Emissão</p>
            <p className="font-medium text-slate-800 font-mono tabular-nums">
              {issue_date ? new Date(issue_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total da nota</p>
            <p className="font-bold text-purple-700 font-mono tabular-nums">{BRL(total_value)}</p>
          </div>
        </div>
      </div>

      {/* Fornecedor */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800 text-sm">Fornecedor (será criado/atualizado)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-slate-500">Razão Social</p>
            <p className="font-medium text-slate-800">{supplier.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">CNPJ</p>
            <p className="font-medium text-slate-800">{supplier.cnpj || '—'}</p>
          </div>
          {supplier.city && (
            <div>
              <p className="text-xs text-slate-500">Cidade/UF</p>
              <p className="font-medium text-slate-800">{supplier.city}{supplier.state ? `/${supplier.state}` : ''}</p>
            </div>
          )}
          {supplier.ie && (
            <div>
              <p className="text-xs text-slate-500">IE</p>
              <p className="font-medium text-slate-800">{supplier.ie}</p>
            </div>
          )}
        </div>
      </div>

      {/* Itens */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Package className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800 text-sm">{items.length} item(ns)</span>
          {editavel && (
            <span className="text-[11px] text-slate-400">— confira antes de dar entrada</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-2 px-3 text-left font-semibold text-slate-600">Descrição</th>
                <th className="py-2 px-3 text-center font-semibold text-slate-600">NCM</th>
                <th className="py-2 px-3 text-center font-semibold text-slate-600">EAN</th>
                <th className="py-2 px-3 text-right font-semibold text-slate-600">Qtd</th>
                <th className="py-2 px-3 text-right font-semibold text-slate-600">Vl. Unit.</th>
                <th className="py-2 px-3 text-right font-semibold text-slate-600">Total</th>
                {editavel && <th className="py-2 px-2"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const { a, fora, qtd, unit, tot } = emVigor(i)
                const abertos = impostosAbertos.has(i)
                return (
                  <FragmentoDeItem key={i}>
                    <tr className={`border-b ${abertos ? 'border-transparent' : 'border-slate-100'} ${fora ? 'bg-slate-50 opacity-50' : 'hover:bg-slate-50'}`}>
                      <td className="py-2 px-3 text-slate-800 max-w-[220px]">
                        {editavel && !fora ? (
                          <input
                            value={a?.description ?? item.description}
                            onChange={e => mudar(i, { description: e.target.value })}
                            className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs"
                          />
                        ) : (
                          <span className={fora ? 'line-through' : 'block truncate'} title={item.description}>
                            {item.description}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-500 font-mono">{item.ncm || '—'}</td>
                      <td className="py-2 px-3 text-center text-slate-500 font-mono">{item.ean || '—'}</td>
                      <td className="py-2 px-3 text-right">
                        {editavel && !fora ? (
                          <input
                            type="number" step="any" min="0" value={qtd}
                            onChange={e => mudarQuantidade(i, e.target.value)}
                            title="Mudar a quantidade mantém o total do item e recalcula o preço unitário"
                            className="w-16 rounded border border-slate-200 px-1 py-1 text-right text-xs tabular-nums"
                          />
                        ) : (
                          <span className="font-mono tabular-nums text-slate-700">{qtd}</span>
                        )}
                        <span className="ml-1 text-[10px] text-slate-400">{item.unit}</span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {editavel && !fora ? (
                          <input
                            type="number" step="0.0001" min="0" value={unit}
                            onChange={e => mudarUnitario(i, e.target.value)}
                            title="Mudar o unitário recalcula o total do item"
                            className="w-24 rounded border border-slate-200 px-1 py-1 text-right text-xs tabular-nums"
                          />
                        ) : (
                          <span className="font-mono tabular-nums text-slate-700">{BRL(unit)}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-800 font-mono tabular-nums">
                        {editavel && !fora ? (
                          <input
                            type="number" step="0.01" min="0" value={tot}
                            onChange={e => mudarTotal(i, e.target.value)}
                            title="Mudar o total recalcula o preço unitário"
                            className="w-24 rounded border border-slate-200 px-1 py-1 text-right text-xs font-semibold tabular-nums"
                          />
                        ) : BRL(tot)}
                      </td>
                      {editavel && (
                        <td className="py-2 px-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleImpostos(i)}
                            title={abertos ? 'Esconder impostos' : 'Ver e corrigir impostos do item'}
                            className={`rounded p-1 hover:bg-slate-100 ${abertos ? 'text-purple-700' : 'text-slate-400 hover:text-purple-700'}`}
                          >
                            <Percent className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => mudar(i, { excluir: !fora })}
                            title={fora ? 'Incluir de volta' : 'Não recebi este item'}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                          >
                            {fora ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      )}
                    </tr>
                    {editavel && abertos && !fora && (
                      <tr className="border-b border-slate-100 bg-purple-50/40">
                        <td colSpan={7} className="px-3 pb-3 pt-1">
                          <div className="flex flex-wrap items-end gap-2">
                            {CAMPOS_FISCAIS.map(c => {
                              const valorAjuste = a?.[c.key]
                              const valorNota = (item as unknown as Record<string, unknown>)[c.key]
                              const valor = valorAjuste ?? valorNota ?? ''
                              return (
                                <label key={c.key} className="flex flex-col gap-0.5" title={c.dica}>
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{c.label}</span>
                                  <input
                                    type={c.tipo === 'numero' ? 'number' : 'text'}
                                    step={c.tipo === 'numero' ? '0.01' : undefined}
                                    min={c.tipo === 'numero' ? '0' : undefined}
                                    value={valor as string | number}
                                    onChange={e => {
                                      const v = e.target.value
                                      if (c.tipo === 'numero') mudar(i, { [c.key]: v === '' ? undefined : Number(v) } as Partial<AjusteDeItem>)
                                      else mudar(i, { [c.key]: v } as Partial<AjusteDeItem>)
                                    }}
                                    className={`rounded border border-slate-200 bg-white px-1.5 py-1 text-xs tabular-nums ${c.tipo === 'numero' ? 'w-24 text-right' : 'w-20'}`}
                                  />
                                </label>
                              )
                            })}
                            <button type="button" onClick={() => toggleImpostos(i)} className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700">
                              <ChevronUp className="h-3 w-3" /> fechar
                            </button>
                          </div>
                          <p className="mt-1.5 text-[10px] text-slate-400">
                            Valores como vieram no XML{item.icms_origin ? ` · origem ${item.icms_origin}` : ''}. Corrija só o que o fornecedor errou — o XML não muda, a correção fica na compra.
                          </p>
                        </td>
                      </tr>
                    )}
                  </FragmentoDeItem>
                )
              })}
            </tbody>
          </table>
        </div>

        {editavel && temImposto && impostosAbertos.size === 0 && (
          <button
            type="button"
            onClick={() => setImpostosAbertos(new Set(items.map((_, i) => i)))}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-900"
          >
            <ChevronDown className="h-3 w-3" /> Mostrar impostos de todos os itens (CFOP, CST, ICMS, IPI, PIS, COFINS)
          </button>
        )}

        {mudouTotal && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Com as correções, a entrada fica em <strong>{BRL(totalAjustado)}</strong> — a nota do
            fornecedor é de {BRL(total_value)}. O que foi alterado fica registrado na compra.
          </p>
        )}

        <p className="mt-2 text-xs text-slate-400">
          {editavel
            ? 'Mudar a quantidade mantém o total e recalcula o unitário (caixa com 2 vira 2 unidades pela metade do preço). Recebeu menos? Corrija o total ou o unitário. O XML do fornecedor não é alterado.'
            : 'Os itens serão vinculados automaticamente ao estoque por EAN ou nome similar.'}
        </p>
      </div>
    </div>
  )
}

/** Agrupa a linha do item e a linha de impostos sob a mesma chave. */
function FragmentoDeItem({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
