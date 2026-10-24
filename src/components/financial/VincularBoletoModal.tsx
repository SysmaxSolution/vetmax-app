'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Loader2, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { titulosParaVincular, vincularBoletoATitulo } from '@/lib/actions/pagfor'

/**
 * Amarra à mão o boleto do banco ao título que já está no sistema.
 *
 * Nenhuma regra automática pega tudo: fornecedor cadastrado com outro CNPJ,
 * valor renegociado, vencimento adiado. Sem esta saída, o operador vê um
 * boleto que ele SABE que já foi lançado e não tem o que fazer — ou lança a
 * duplicata, que é pior.
 */

const BRL = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dia = (iso: string | null) => {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

interface Titulo {
  id: string; amount: number; due_date: string | null
  descricao: string; fornecedor: string | null; ja_vinculado: boolean
}

interface Props {
  /** Identidade do boleto no sistema. */
  fingerprint: string
  boleto: { beneficiary?: string | null; amount?: number | null; due_date?: string | null }
  onClose:   () => void
  onVinculado: () => void
}

export default function VincularBoletoModal({ fingerprint, boleto, onClose, onVinculado }: Props) {
  const [titulos, setTitulos]   = useState<Titulo[]>([])
  const [busca, setBusca]       = useState('')
  const [carregando, setCarreg] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro]         = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarreg(true)
    const r = await titulosParaVincular({ valor: boleto.amount ?? undefined, busca })
    setCarreg(false)
    if ('error' in r) { setErro(r.error); return }
    setTitulos(r)
  }, [boleto.amount, busca])

  useEffect(() => { void carregar() }, [carregar])

  async function vincular(t: Titulo) {
    setSalvando(t.id); setErro(null)
    const r = await vincularBoletoATitulo(fingerprint, t.id)
    setSalvando(null)
    if ('error' in r) { setErro(r.error); return }
    onVinculado()
    onClose()
  }

  const mesmoValor = (t: Titulo) =>
    boleto.amount != null && Math.round(t.amount * 100) === Math.round(boleto.amount * 100)

  const corpo = (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="my-6 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">

        <div className="flex items-center justify-between border-b border-slate-100 bg-indigo-50/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600">
              <Link2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Vincular a um título já lançado</h2>
              <p className="text-[11px] text-slate-500">
                {boleto.beneficiary ?? 'Boleto'} · {BRL(boleto.amount)} · vence {dia(boleto.due_date ?? null)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase text-slate-500">Procurar título</span>
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="fornecedor, número da nota…"
                className="w-full text-sm outline-none"
              />
            </div>
          </label>

          {erro && (
            <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{erro}
            </p>
          )}

          <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200">
            {carregando ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : titulos.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                Nenhum título a pagar em aberto{busca ? ' com esse texto' : ''}.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Título</th>
                    <th className="px-3 py-2 text-left">Vencimento</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {titulos.map(t => (
                    <tr key={t.id} className={mesmoValor(t) ? 'bg-emerald-50/40' : ''}>
                      <td className="px-3 py-2">
                        <span className="block font-medium text-slate-800">{t.fornecedor ?? '—'}</span>
                        <span className="block text-[11px] text-slate-500">{t.descricao.slice(0, 60)}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{dia(t.due_date)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                        {BRL(t.amount)}
                        {mesmoValor(t) && (
                          <CheckCircle2 className="ml-1 inline h-3 w-3 text-emerald-600" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {t.ja_vinculado ? (
                          <span className="text-[10px] text-slate-400">já vinculado</span>
                        ) : (
                          <button
                            onClick={() => void vincular(t)}
                            disabled={salvando !== null}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {salvando === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Vincular'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            Os de mesmo valor aparecem primeiro. Ao vincular, o código de barras do boleto é
            guardado no título — da próxima vez o reconhecimento é automático.
          </p>
        </div>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? null : createPortal(corpo, document.body)
}
