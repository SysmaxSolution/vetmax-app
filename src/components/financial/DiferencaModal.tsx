'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { criarTituloDaDiferenca } from '@/lib/actions/financial'
import { X, AlertTriangle, RefreshCcw, PlusCircle } from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Props {
  statementIds: string[]
  /** Diferença COM sinal: positiva = o extrato recebeu mais do que os títulos somam. */
  diferenca: number
  totalExtrato: number
  totalSistema: number
  onClose: () => void
  onCriado: (msg: string) => void
}

/**
 * Lança a DIFERENÇA de uma conciliação que não fecha como um título novo.
 *
 * Por quê: extrato e sistema nem sempre batem — tarifa que o banco cobrou e
 * ninguém lançou, juros recebido, desconto dado na boca do caixa. Antes o
 * operador tinha que sair da tela, lançar à mão, voltar e procurar; ou deixava
 * a linha sem conciliar, que é pior: a conciliação perde o sentido se sobram
 * linhas eternamente pendentes.
 *
 * O sinal já sugere o tipo, mas quem decide é o operador: sobrou no extrato
 * normalmente é receita não lançada; faltou, despesa. Normalmente — não sempre.
 */
export default function DiferencaModal({
  statementIds, diferenca, totalExtrato, totalSistema, onClose, onCriado,
}: Props) {
  const sugerido: 'receivable' | 'payable' = diferenca >= 0 ? 'receivable' : 'payable'
  const [tipo, setTipo]             = useState<'receivable' | 'payable'>(sugerido)
  const [descricao, setDescricao]   = useState('')
  const [valorStr, setValorStr]     = useState(Math.abs(diferenca).toFixed(2).replace('.', ','))
  const [vencimento, setVencimento] = useState('')
  const [categoria, setCategoria]   = useState('')
  const [notas, setNotas]           = useState('')
  const [busy, setBusy]             = useState(false)
  const [erro, setErro]             = useState<string | null>(null)

  const valor = Number(valorStr.replace(/\./g, '').replace(',', '.'))
  const valorOk = Number.isFinite(valor) && valor > 0

  async function salvar() {
    if (busy) return
    if (!descricao.trim()) { setErro('Informe a descrição do título.'); return }
    if (!valorOk)          { setErro('Informe um valor válido.'); return }
    setBusy(true); setErro(null)
    const r = await criarTituloDaDiferenca({
      statement_ids: statementIds,
      // O sinal vem do TIPO escolhido, não do que o cálculo sugeriu: se o
      // operador trocou, é a escolha dele que vale.
      valor: tipo === 'receivable' ? valor : -valor,
      tipo,
      description: descricao.trim(),
      due_date: vencimento || undefined,
      category: categoria.trim() || undefined,
      notes: notas.trim() || undefined,
    })
    if ('error' in r) { setErro(r.error); setBusy(false); return }
    onCriado(`Título da diferença criado (${fmt(valor)}) e vinculado aos lançamentos.`)
    setBusy(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700"><AlertTriangle className="h-5 w-5" /></span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">A conciliação não fecha</h3>
              <p className="text-xs text-slate-500">Lance a diferença como título para fechar os lançamentos marcados.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Extrato</p>
              <p className="text-sm font-semibold tabular-nums text-slate-800">{fmt(totalExtrato)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sistema</p>
              <p className="text-sm font-semibold tabular-nums text-slate-800">{fmt(totalSistema)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Diferença</p>
              <p className="text-sm font-semibold tabular-nums text-amber-700">{fmt(diferenca)}</p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">Lançar como</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setTipo('receivable')}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${tipo === 'receivable' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                Conta a receber
              </button>
              <button onClick={() => setTipo('payable')}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${tipo === 'payable' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                Conta a pagar
              </button>
            </div>
            {tipo !== sugerido && (
              <p className="mt-1.5 text-[11px] text-amber-700">
                Pelo sinal da diferença o esperado seria {sugerido === 'receivable' ? 'conta a receber' : 'conta a pagar'}. Confirme se é isso mesmo.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">Descrição <span className="text-rose-600">*</span></label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)} autoFocus
              placeholder="Ex.: Tarifa bancária de cobrança, Juros recebido, Desconto concedido"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Valor <span className="text-rose-600">*</span></label>
              <input value={valorStr} onChange={e => setValorStr(e.target.value)} inputMode="decimal"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Vencimento</label>
              <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
              <p className="mt-1 text-[11px] text-slate-400">Vazio = data da transação.</p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">Categoria</label>
            <input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Opcional"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700">Observações</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Opcional"
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
          </div>

          {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={onClose} disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Deixar pendente
          </button>
          <button onClick={salvar} disabled={busy || !descricao.trim() || !valorOk}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {busy ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Lançar diferença
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
