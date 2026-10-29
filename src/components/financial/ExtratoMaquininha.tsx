'use client'

// Extrato da maquininha FinPet (EvoluServices): cada cobrança com a situação na
// operadora, o título que ela baixou (ou não), o repasse do profissional e as
// ações — baixar o título com uma cobrança aprovada (caixa fechado antes do
// comprovante), cancelar antes da captura e estornar venda aprovada.

import { useEffect, useState, useTransition } from 'react'
import { RefreshCcw, Check, XCircle, Undo2, AlertTriangle, Smartphone, Loader2 } from 'lucide-react'
import { getExtratoCartao, baixarTituloComCobranca, estornarCobranca } from '@/lib/actions/card-acquirer'
import type { LinhaExtratoCartao } from '@/types/card-acquirer'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDataHora = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const primeiroDoMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const hoje = () => new Date().toISOString().slice(0, 10)

const TOM: Record<LinhaExtratoCartao['situacao'], string> = {
  aprovada:    'bg-emerald-100 text-emerald-700',
  aguardando:  'bg-amber-100 text-amber-700',
  recusada:    'bg-rose-100 text-rose-700',
  cancelada:   'bg-slate-200 text-slate-600',
  desconhecida: 'bg-slate-100 text-slate-500',
}

interface Props {
  empresas: { id: string; code: string; name: string; is_default: boolean }[]
  userRole: string
}

export default function ExtratoMaquininha({ empresas, userRole }: Props) {
  const gestao = ['admin', 'owner', 'manager'].includes(userRole)
  const [empresaId, setEmpresaId] = useState<string>('')
  const [desde, setDesde] = useState(primeiroDoMes())
  const [ate, setAte]     = useState(hoje())
  const [linhas, setLinhas] = useState<LinhaExtratoCartao[]>([])
  const [erro, setErro]   = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [agindo, setAgindo] = useState<string | null>(null)
  // Estorno: pede o motivo na própria linha.
  const [estornando, setEstornando] = useState<{ id: string; motivo: string } | null>(null)

  function carregar() {
    setErro(null)
    iniciar(async () => {
      const r = await getExtratoCartao({ companyId: empresaId || null, desde: desde || null, ate: ate || null })
      if ('error' in r) { setErro(r.error); return }
      setLinhas(r)
    })
  }
  useEffect(() => { carregar() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function baixar(l: LinhaExtratoCartao) {
    setAgindo(l.id); setErro(null); setAviso(null)
    const r = await baixarTituloComCobranca(l.id)
    setAgindo(null)
    if ('error' in r) { setErro(r.error); return }
    setAviso(r.invoice_status === 'ja_baixado'
      ? 'O título já estava baixado com este NSU — só amarramos a cobrança a ele.'
      : 'Título baixado com a cobrança da maquininha.')
    carregar()
  }

  async function confirmarEstorno() {
    if (!estornando) return
    setAgindo(estornando.id); setErro(null); setAviso(null)
    const r = await estornarCobranca({ cardTransactionId: estornando.id, motivo: estornando.motivo })
    setAgindo(null)
    if ('error' in r) { setErro(r.error); return }
    setAviso(r.mensagem)
    setEstornando(null)
    carregar()
  }

  const totais = linhas.reduce((a, l) => {
    if (l.situacao === 'aprovada') { a.aprovado += l.amount; a.split += l.total_split; a.n += 1 }
    return a
  }, { aprovado: 0, split: 0, n: 0 })

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          {empresas.length > 1 && (
            <div className="min-w-[180px]">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Empresa</label>
              <select value={empresaId} onChange={e => setEmpresaId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20">
                <option value="">Todas as empresas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">De</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Até</label>
            <input type="date" value={ate} onChange={e => setAte(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
          </div>
          <button onClick={carregar} disabled={pendente}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50">
            <RefreshCcw className={`h-4 w-4 ${pendente ? 'animate-spin' : ''}`} /> {pendente ? 'Carregando…' : 'Carregar'}
          </button>
          <div className="ml-auto text-right text-xs text-slate-500">
            <span className="block">Aprovadas no período: <strong className="text-slate-800">{totais.n}</strong> · {fmt(totais.aprovado)}</span>
            <span className="block">Repasse a profissionais: <strong className="text-slate-800">{fmt(totais.split)}</strong></span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          O comprovante da maquininha chega pelo retorno da operadora (no POS, 10–15 min depois). Estorno de venda aprovada é feito no
          portal FinPet: aqui o pedido fica registrado e a baixa do título é desfeita; o retorno confirma.
        </p>
      </div>

      {erro && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</p>}
      {aviso && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{aviso}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Quando</th>
              <th className="px-3 py-2">OS · Tutor</th>
              <th className="px-3 py-2">Empresa</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Repasse</th>
              <th className="px-3 py-2">Bandeira · NSU</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                <Smartphone className="mx-auto mb-2 h-6 w-6 text-slate-300" />Nenhuma cobrança da maquininha no período.
              </td></tr>
            )}
            {linhas.map(l => (
              <tr key={l.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDataHora(l.created_at)}<span className="block text-[10px] text-slate-400">{l.kind === 'remote' ? 'maquininha' : 'link'} · {l.reference}</span></td>
                <td className="px-3 py-2">{l.os_number ? `OS ${l.os_number}` : '—'}<span className="block text-[11px] text-slate-500">{l.tutor_nome ?? '—'}</span></td>
                <td className="px-3 py-2 text-slate-600">{l.company_name ?? '—'}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800 whitespace-nowrap">{fmt(l.amount)}{l.installments && l.installments > 1 ? <span className="block text-[10px] font-normal text-slate-400">{l.installments}x</span> : null}</td>
                <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">{l.total_split > 0 ? fmt(l.total_split) : '—'}</td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{l.payment_brand ?? '—'}<span className="block font-mono text-[11px] text-slate-500">{l.nsu ? `NSU ${l.nsu}` : 'sem comprovante'}</span></td>
                <td className="px-3 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${TOM[l.situacao]}`}>{l.rotulo_status}</span></td>
                <td className="px-3 py-2 text-[12px] text-slate-600">{l.titulo}{l.reversed_at && <span className="block text-[10px] text-slate-400">estornado em {fmtDataHora(l.reversed_at)}</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div className="flex flex-col items-end gap-1">
                    {l.pode_baixar && (
                      <button onClick={() => void baixar(l)} disabled={agindo === l.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        {agindo === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Baixar título
                      </button>
                    )}
                    {gestao && (l.pode_cancelar || l.pode_estornar) && estornando?.id !== l.id && (
                      <button onClick={() => setEstornando({ id: l.id, motivo: '' })} disabled={agindo === l.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                        {l.pode_cancelar ? <><XCircle className="h-3 w-3" /> Cancelar</> : <><Undo2 className="h-3 w-3" /> Estornar</>}
                      </button>
                    )}
                    {estornando?.id === l.id && (
                      <div className="w-56 rounded-lg border border-rose-200 bg-rose-50 p-2 text-left">
                        <label className="block text-[10px] font-semibold text-rose-800 mb-1">Motivo do {l.pode_cancelar ? 'cancelamento' : 'estorno'}</label>
                        <input value={estornando.motivo} onChange={e => setEstornando({ id: l.id, motivo: e.target.value })} autoFocus
                          placeholder="ex.: valor errado, tutor desistiu"
                          className="w-full rounded border border-rose-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-rose-300" />
                        <div className="mt-1.5 flex justify-end gap-1">
                          <button onClick={() => setEstornando(null)} className="rounded px-2 py-1 text-[11px] text-slate-600 hover:bg-white">Voltar</button>
                          <button onClick={() => void confirmarEstorno()} disabled={!estornando.motivo.trim() || agindo === l.id}
                            className="rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                            {agindo === l.id ? 'Aguarde…' : 'Confirmar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
