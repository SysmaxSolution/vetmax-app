'use client'

// Lista de compras pela saída e painel de validade (Fase 4 · item 4.4).
//
// A dor da Aline: hoje a lista de compras e a planilha de validades são
// mantidas à mão. Aqui as duas saem do que o sistema já grava — consumo real
// nos movimentos e lotes com validade —, e por isso continuam verdadeiras depois
// do primeiro mês.

import { useCallback, useEffect, useState } from 'react'
import {
  ShoppingCart, CalendarX2, Loader2, AlertTriangle, MapPin, Printer, Ban, Check, MapPinned,
} from 'lucide-react'
import { getListaDeCompras, getPainelDeValidade, baixarPerdaDeLote } from '@/lib/actions/stock-reposicao'
import { descreverValidade } from '@/lib/stock/reposicao'
import type { ListaDeCompras, PainelDeValidade } from '@/types/estoque-reposicao'
import EnderecamentoPanel from '@/components/pharmacy/EnderecamentoPanel'

const COR_URGENCIA: Record<string, string> = {
  critico:    'bg-rose-50 text-rose-700 border-rose-200',
  atencao:    'bg-amber-50 text-amber-700 border-amber-200',
  programado: 'bg-slate-100 text-slate-600 border-slate-200',
}

const ROTULO_URGENCIA: Record<string, string> = {
  critico: 'Urgente', atencao: 'Atenção', programado: 'Programar',
}

type Aba = 'compras' | 'validade' | 'enderecos'

export default function ReposicaoPanel() {
  const [aba, setAba]               = useState<Aba>('compras')
  const [dias, setDias]             = useState(90)
  const [janela, setJanela]         = useState(60)
  const [compras, setCompras]       = useState<ListaDeCompras | null>(null)
  const [validade, setValidade]     = useState<PainelDeValidade | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro]             = useState<string | null>(null)
  const [aviso, setAviso]           = useState<string | null>(null)
  const [baixando, setBaixando]     = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (aba === 'enderecos') { setCarregando(false); return }
    setCarregando(true)
    setErro(null)
    if (aba === 'compras') {
      const res = await getListaDeCompras(dias)
      if ('error' in res) setErro(res.error)
      else setCompras(res)
    } else {
      const res = await getPainelDeValidade(janela)
      if ('error' in res) setErro(res.error)
      else setValidade(res)
    }
    setCarregando(false)
  }, [aba, dias, janela])

  useEffect(() => { void carregar() }, [carregar])

  async function darBaixaDePerda(stockItemId: string, batchId: string, quantidade: number, nome: string) {
    // Motivo obrigatório vem do banco; aqui é só o aceite consciente de que o
    // material sai do saldo.
    const motivo = window.prompt(
      `Dar baixa de ${quantidade} de "${nome}" como perda.\n\nMotivo (obrigatório):`,
      'Vencimento do lote',
    )
    if (motivo === null) return
    setBaixando(batchId)
    const res = await baixarPerdaDeLote({ stockItemId, batchId, quantidade, motivo })
    setBaixando(null)
    if ('error' in res) { setErro(res.error); return }
    setAviso(`Perda registrada. Saldo de "${nome}": ${res.saldo_depois}.`)
    setTimeout(() => setAviso(null), 6000)
    void carregar()
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <header className="border-b border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 print:hidden">
          <button onClick={() => setAba('compras')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              aba === 'compras' ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'text-slate-500 hover:bg-slate-50'}`}>
            <ShoppingCart className="h-4 w-4" />
            Lista de compras
            {compras && compras.totais.criticos > 0 && (
              <span className="ml-0.5 text-[10px] font-bold bg-rose-600 text-white rounded-full px-1.5 py-0.5">
                {compras.totais.criticos}
              </span>
            )}
          </button>
          <button onClick={() => setAba('enderecos')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              aba === 'enderecos' ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'text-slate-500 hover:bg-slate-50'}`}>
            <MapPinned className="h-4 w-4" />
            Endereçamento
          </button>
          <button onClick={() => setAba('validade')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              aba === 'validade' ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'text-slate-500 hover:bg-slate-50'}`}>
            <CalendarX2 className="h-4 w-4" />
            Validade
            {validade && validade.totais.vencidos > 0 && (
              <span className="ml-0.5 text-[10px] font-bold bg-rose-600 text-white rounded-full px-1.5 py-0.5">
                {validade.totais.vencidos}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          {aba === 'enderecos' ? null : aba === 'compras' ? (
            <label className="text-xs text-slate-500 flex items-center gap-1.5">
              Consumo dos últimos
              <select value={dias} onChange={e => setDias(Number(e.target.value))}
                className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20">
                {[30, 60, 90, 180].map(d => <option key={d} value={d}>{d} dias</option>)}
              </select>
            </label>
          ) : (
            <label className="text-xs text-slate-500 flex items-center gap-1.5">
              Avisar com
              <select value={janela} onChange={e => setJanela(Number(e.target.value))}
                className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20">
                {[30, 60, 90, 180].map(d => <option key={d} value={d}>{d} dias</option>)}
              </select>
              de antecedência
            </label>
          )}
          <button onClick={() => window.print()}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Imprimir">
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </header>

      {erro && <div className="px-6 py-3 bg-rose-50 border-b border-rose-100 text-sm text-rose-700">{erro}</div>}
      {aviso && <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-100 text-sm text-emerald-700">{aviso}</div>}

      {aba === 'enderecos' ? (
        <div className="px-6 py-4">
          <EnderecamentoPanel onToast={(t, m) => {
            if (t === 'ok') { setErro(null); setAviso(m) } else { setAviso(null); setErro(m) }
            setTimeout(() => { setAviso(null); setErro(null) }, 6000)
          }} />
        </div>
      ) : carregando ? (
        <div className="px-6 py-12 flex items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : aba === 'compras' ? (
        !compras || compras.itens.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            Nada a comprar no momento — nenhum item no ponto de pedido.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-6 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Onde está</th>
                  <th className="px-3 py-2 font-semibold text-right">Saldo</th>
                  <th className="px-3 py-2 font-semibold text-right">Consumo/dia</th>
                  <th className="px-3 py-2 font-semibold text-right">Dura</th>
                  <th className="px-6 py-2 font-semibold text-right">Comprar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {compras.itens.map(i => (
                  <tr key={i.stock_item_id}>
                    <td className="px-6 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-800">{i.name}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${COR_URGENCIA[i.urgencia]}`}>
                          {ROTULO_URGENCIA[i.urgencia]}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{i.motivo}</p>
                      {i.supplier_name && <p className="text-[11px] text-slate-400">Fornecedor: {i.supplier_name}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {i.shelf_code || i.location_name ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          {[i.shelf_code, i.location_name].filter(Boolean).join(' · ')}
                        </span>
                      ) : <span className="text-slate-300">sem endereço</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${i.quantity < 0 ? 'text-rose-700 font-semibold' : 'text-slate-600'}`}>
                      {i.quantity} {i.unit ?? ''}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{i.consumo_diario}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {i.dias_restantes === null ? '—' : `${i.dias_restantes}d`}
                    </td>
                    <td className="px-6 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {i.sugerido} {i.unit ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100">
              Calculado sobre a saída real dos últimos {compras.dias_observados} dias. O ponto de pedido
              considera o prazo de entrega de cada item; a quantidade já respeita embalagem fechada e pedido mínimo.
            </p>
          </div>
        )
      ) : (
        !validade || validade.alertas.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            Nenhum lote vencendo nos próximos {validade?.janela_dias ?? janela} dias.
          </div>
        ) : (
          <>
            {validade.totais.vencidos > 0 && (
              <div className="px-6 py-3 bg-rose-50 border-b border-rose-100 text-sm text-rose-700 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>
                  {validade.totais.vencidos} lote(s) já vencido(s), com {validade.totais.quantidade_vencida} unidade(s)
                  ainda no saldo. Dê baixa de perda para o estoque voltar a fechar.
                </p>
              </div>
            )}
            <ul className="divide-y divide-slate-100">
              {validade.alertas.map(a => (
                <li key={a.batch_id} className="px-6 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm text-slate-800">{a.item_name}</span>
                      {a.situacao === 'vencido' && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                          vencido
                        </span>
                      )}
                      {a.is_controlled && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                          controlado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{descreverValidade(a)}</p>
                    {(a.shelf_code || a.location_name) && (
                      <p className="text-[11px] text-slate-400 mt-0.5 inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[a.shelf_code, a.location_name].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {a.situacao === 'vencido' && (
                    <button
                      onClick={() => darBaixaDePerda(a.stock_item_id, a.batch_id, a.quantity, a.item_name)}
                      disabled={baixando === a.batch_id}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 print:hidden"
                    >
                      {baixando === a.batch_id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Ban className="h-3.5 w-3.5" />}
                      Dar baixa de perda
                    </button>
                  )}
                  {a.situacao === 'vence_em_breve' && (
                    <span className="flex-shrink-0 text-[11px] text-slate-400 inline-flex items-center gap-1 pt-1">
                      <Check className="h-3 w-3" /> ainda dá tempo de usar
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </section>
  )
}
