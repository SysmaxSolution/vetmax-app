'use client'

// Conferência da devolução do kit cirúrgico (Fase 4 · item 4.1).
//
// A tela é desenhada para o fim de uma cirurgia, não para o escritório: a
// premissa é "saiu tudo", e quem confere marca só o que voltou. Se a conferência
// exigisse digitar linha por linha, não seria feita — e não ser feita é
// exatamente o estado de hoje, com material voltando fechado para a prateleira
// mas continuando cobrado do tutor.

import { useState } from 'react'
import { PackageCheck, Loader2, AlertTriangle, Undo2, Ban, Check } from 'lucide-react'
import { conferirDevolucaoKit } from '@/lib/actions/surgery-kits'
import { conferirDevolucaoDoKit } from '@/lib/stock/kit-conferencia'
import type { KitApplicationRow } from '@/types/surgery-kits'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const numero = (texto: string): number => {
  const n = Number(String(texto).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

interface Props {
  aplicacoes: KitApplicationRow[]
  onConferido: () => void
  onToast: (tipo: 'ok' | 'erro', msg: string) => void
}

export default function KitConferenciaPanel({ aplicacoes, onConferido, onToast }: Props) {
  const [abertoId, setAbertoId]   = useState<string | null>(null)
  const [devolvido, setDevolvido] = useState<Record<string, string>>({})
  const [perdido, setPerdido]     = useState<Record<string, string>>({})
  const [salvando, setSalvando]   = useState(false)

  if (aplicacoes.length === 0) return null

  const pendentes = aplicacoes.filter(a => a.status === 'aplicado')
  const conferidas = aplicacoes.filter(a => a.status === 'conferido')

  function abrir(app: KitApplicationRow) {
    setAbertoId(abertoId === app.id ? null : app.id)
    setDevolvido({})
    setPerdido({})
  }

  /** Prévia calculada no cliente com o MESMO módulo que a action usa no servidor. */
  function previa(app: KitApplicationRow) {
    return conferirDevolucaoDoKit(
      app.items.map(i => ({
        id: i.id, item_name: i.item_name, unit: i.unit,
        quantity_planned: i.quantity_planned, unit_price: i.unit_price, returnable: i.returnable,
      })),
      app.items.map(i => ({
        item_id: i.id,
        devolvido: numero(devolvido[i.id] ?? ''),
        perdido:   numero(perdido[i.id] ?? ''),
      })),
    )
  }

  async function confirmar(app: KitApplicationRow) {
    setSalvando(true)
    const res = await conferirDevolucaoKit(
      app.id,
      app.items.map(i => ({
        item_id: i.id,
        devolvido: numero(devolvido[i.id] ?? ''),
        perdido:   numero(perdido[i.id] ?? ''),
      })),
    )
    setSalvando(false)
    if ('error' in res) { onToast('erro', res.error); return }

    // Falha isolada numa linha não impede a conferência, mas aparece — nunca se
    // engole um insumo que não voltou ao estoque.
    if (res.avisos.length > 0) onToast('erro', res.avisos.join(' '))
    else onToast('ok', res.mensagem)

    setAbertoId(null)
    onConferido()
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
        <PackageCheck className="h-3 w-3" /> Kits aplicados
      </p>

      {pendentes.map(app => {
        const aberto = abertoId === app.id
        const p = aberto ? previa(app) : null

        return (
          <div key={app.id} className="rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{app.kit_name}</p>
                <p className="text-[11px] text-amber-700">
                  Aguardando conferência da devolução
                  {app.applied_by_name ? ` · aplicado por ${app.applied_by_name}` : ''}
                </p>
              </div>
              <button
                onClick={() => abrir(app)}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-bold text-white"
              >
                {aberto ? 'Fechar' : 'Conferir'}
              </button>
            </div>

            {aberto && (
              <div className="border-t border-amber-200 bg-white px-3 py-3 space-y-2">
                <p className="text-[11px] text-slate-500">
                  Marque só o que <strong>não foi usado</strong>. O que ficar em branco conta como aplicado no animal.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                        <th className="py-1 pr-2 font-semibold">Insumo</th>
                        <th className="py-1 px-2 font-semibold text-right">Saiu</th>
                        <th className="py-1 px-2 font-semibold text-right">Voltou fechado</th>
                        <th className="py-1 pl-2 font-semibold text-right">Aberto sem uso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {app.items.map(i => {
                        const linha = p?.linhas.find(l => l.item_id === i.id)
                        return (
                          <tr key={i.id}>
                            <td className="py-1.5 pr-2">
                              <span className="text-slate-800">{i.item_name}</span>
                              {!i.returnable && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5">
                                  <Ban className="h-2.5 w-2.5" /> não retorna
                                </span>
                              )}
                              {linha && linha.consumido !== i.quantity_planned && (
                                <span className="block text-[10px] text-slate-400">
                                  fica no animal: {linha.consumido} {i.unit ?? ''}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">
                              {i.quantity_planned} {i.unit ?? ''}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={devolvido[i.id] ?? ''}
                                onChange={e => setDevolvido(s => ({ ...s, [i.id]: e.target.value }))}
                                disabled={!i.returnable || !i.stock_item_id}
                                placeholder="0"
                                className="w-16 px-2 py-1 border border-slate-300 rounded text-right text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-300"
                              />
                            </td>
                            <td className="py-1.5 pl-2 text-right">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={perdido[i.id] ?? ''}
                                onChange={e => setPerdido(s => ({ ...s, [i.id]: e.target.value }))}
                                disabled={!i.stock_item_id}
                                placeholder="0"
                                className="w-16 px-2 py-1 border border-slate-300 rounded text-right text-xs outline-none focus:ring-2 focus:ring-rose-500/20 disabled:bg-slate-50 disabled:text-slate-300"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {p && p.avisos.length > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 space-y-0.5">
                    {p.avisos.map((a, idx) => (
                      <p key={idx} className="text-[11px] text-amber-800 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />{a}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-[11px] text-slate-600 space-y-0.5">
                    {p && p.total_devolvido > 0 && (
                      <p className="flex items-center gap-1 text-emerald-700">
                        <Undo2 className="h-3 w-3" /> {p.total_devolvido} volta(m) ao estoque
                      </p>
                    )}
                    {p && p.total_perdido > 0 && (
                      <p className="flex items-center gap-1 text-rose-700">
                        <Ban className="h-3 w-3" /> {p.total_perdido} registrado(s) como perda
                      </p>
                    )}
                    {p && p.total_abatimento > 0 && (
                      <p className="font-semibold text-slate-800">
                        {fmtBRL(p.total_abatimento)} sai(em) da conta do tutor
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => confirmar(app)}
                    disabled={salvando}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Confirmar conferência
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {conferidas.map(app => {
        const devolvidoTotal = app.items.reduce((s, i) => s + i.quantity_returned, 0)
        const perdidoTotal = app.items.reduce((s, i) => s + i.quantity_lost, 0)
        return (
          <div key={app.id} className="rounded-xl border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{app.kit_name}</p>
                <p className="text-[11px] text-slate-500">
                  Conferido{app.reconciled_by_name ? ` por ${app.reconciled_by_name}` : ''}
                  {devolvidoTotal > 0 ? ` · ${devolvidoTotal} devolvido(s)` : ''}
                  {perdidoTotal > 0 ? ` · ${perdidoTotal} perda` : ''}
                </p>
              </div>
              <span className="text-xs font-semibold tabular-nums text-slate-700">{fmtBRL(app.total_cobrado)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
