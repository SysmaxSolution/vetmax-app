'use client'

import type { ParsedNFe } from '@/lib/utils/nfe-parser'
import type { AjustesDaEntrada, AjusteDeItem } from '@/types/entrada-mercadoria'
import { Building2, Package, FileText, Trash2, RotateCcw } from 'lucide-react'

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

export function NFXMLPreview({ parsed, ajustes, onAjustar }: Props) {
  const { supplier, items, nfe_number, nfe_series, issue_date, total_value } = parsed

  const editavel = typeof onAjustar === 'function'
  const porIndice = new Map((ajustes?.itens ?? []).map(a => [a.indice, a]))

  /** Guarda a correção do item, preservando o que já havia sido ajustado nele. */
  function mudar(indice: number, patch: Partial<AjusteDeItem>) {
    if (!onAjustar) return
    const atuais = ajustes?.itens ?? []
    const existente = atuais.find(x => x.indice === indice)
    const novo: AjusteDeItem = { ...(existente ?? { indice }), ...patch, indice }
    onAjustar({ ...ajustes, itens: [...atuais.filter(x => x.indice !== indice), novo] })
  }

  // O total que vale é o do que REALMENTE entrou.
  const totalAjustado = items.reduce((soma, item, i) => {
    const a = porIndice.get(i)
    if (a?.excluir) return soma
    const qtd = a?.quantity ?? item.quantity
    const unit = a?.unit_price ?? item.unit_price
    return soma + (a?.total_price ?? Number((qtd * unit).toFixed(2)))
  }, 0)
  const mudouTotal = Math.round(totalAjustado * 100) !== Math.round(total_value * 100)

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
                const a = porIndice.get(i)
                const fora = a?.excluir === true
                const qtd  = a?.quantity ?? item.quantity
                const unit = a?.unit_price ?? item.unit_price
                const tot  = a?.total_price ?? Number((qtd * unit).toFixed(2))
                return (
                  <tr key={i} className={`border-b border-slate-100 ${fora ? 'bg-slate-50 opacity-50' : 'hover:bg-slate-50'}`}>
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
                          onChange={e => mudar(i, { quantity: e.target.value === '' ? undefined : Number(e.target.value) })}
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
                          type="number" step="0.01" min="0" value={unit}
                          onChange={e => mudar(i, { unit_price: e.target.value === '' ? undefined : Number(e.target.value) })}
                          className="w-20 rounded border border-slate-200 px-1 py-1 text-right text-xs tabular-nums"
                        />
                      ) : (
                        <span className="font-mono tabular-nums text-slate-700">{BRL(unit)}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-800 font-mono tabular-nums">
                      {BRL(tot)}
                    </td>
                    {editavel && (
                      <td className="py-2 px-2 text-right">
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
                )
              })}
            </tbody>
          </table>
        </div>

        {mudouTotal && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Com as correções, a entrada fica em <strong>{BRL(totalAjustado)}</strong> — a nota do
            fornecedor é de {BRL(total_value)}. O que foi alterado fica registrado na compra.
          </p>
        )}

        <p className="mt-2 text-xs text-slate-400">
          {editavel
            ? 'Dá para corrigir quantidade, preço e descrição, ou tirar o item que não chegou. O XML do fornecedor não é alterado.'
            : 'Os itens serão vinculados automaticamente ao estoque por EAN ou nome similar.'}
        </p>
      </div>
    </div>
  )
}
