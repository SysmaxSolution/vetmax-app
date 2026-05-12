'use client'

import type { ParsedNFe } from '@/lib/utils/nfe-parser'
import { Building2, Package, FileText } from 'lucide-react'

interface Props {
  parsed: ParsedNFe
}

export function NFXMLPreview({ parsed }: Props) {
  const { supplier, items, nfe_number, nfe_series, issue_date, total_value } = parsed

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
            <p className="font-medium text-slate-800">
              {issue_date ? new Date(issue_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total</p>
            <p className="font-bold text-purple-700">
              {total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
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
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-3 text-slate-800 max-w-[200px] truncate" title={item.description}>
                    {item.description}
                  </td>
                  <td className="py-2 px-3 text-center text-slate-500 font-mono">{item.ncm || '—'}</td>
                  <td className="py-2 px-3 text-center text-slate-500 font-mono">{item.ean || '—'}</td>
                  <td className="py-2 px-3 text-right text-slate-700">{item.quantity} {item.unit}</td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {item.unit_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-800">
                    {item.total_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Os itens serão vinculados automaticamente ao estoque por EAN ou nome similar.
          Itens sem correspondência poderão ser vinculados manualmente após a importação.
        </p>
      </div>
    </div>
  )
}
