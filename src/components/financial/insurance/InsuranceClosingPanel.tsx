'use client'

// Fechamento do convênio por período (Fase 1 · item 1.9).
//
// É o espelho do que o convênio deve, apurado do que foi lançado nas OS — o que
// a Bruna monta à mão, OS por OS, todos os dias. O período já vem do ciclo
// configurado no convênio, então ninguém precisa digitar data; e quando um
// demonstrativo do período já foi importado, a diferença aparece ao lado.

import { useEffect, useState, useCallback } from 'react'
import {
  CalendarRange, Loader2, Printer, AlertTriangle, CheckCircle2, FileSpreadsheet,
} from 'lucide-react'
import { getInsuranceProviders } from '@/lib/actions/insurance-providers'
import { getFechamentoConvenio, listarJanelasDoConvenio } from '@/lib/actions/insurance-closing'
import { ROTULO_CICLO } from '@/lib/insurance/ciclo'
import type { JanelaFechamento } from '@/lib/insurance/ciclo'
import type { InsuranceProvider } from '@/types/insurance-providers'
import type { FechamentoConvenio } from '@/types/insurance-closing'

const reais = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dataBr = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export default function InsuranceClosingPanel() {
  const [convenios, setConvenios]   = useState<InsuranceProvider[]>([])
  const [providerId, setProviderId] = useState<string>('')
  const [janelas, setJanelas]       = useState<JanelaFechamento[]>([])
  const [indice, setIndice]         = useState(1) // 0 = período corrente; 1 = o anterior, que é o que se fecha
  const [dados, setDados]           = useState<FechamentoConvenio | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro]             = useState<string | null>(null)

  useEffect(() => {
    getInsuranceProviders().then(res => {
      if (Array.isArray(res)) {
        const ativos = res.filter(p => p.is_active)
        setConvenios(ativos)
        if (ativos.length > 0) setProviderId(ativos[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (!providerId) return
    listarJanelasDoConvenio(providerId, 8).then(res => {
      if ('error' in res) { setErro(res.error); return }
      setJanelas(res.janelas)
      setIndice(res.ciclo === 'custom' ? 0 : 1)
    })
  }, [providerId])

  const apurar = useCallback(async () => {
    if (!providerId || janelas.length === 0) return
    const janela = janelas[Math.min(indice, janelas.length - 1)]
    setCarregando(true)
    setErro(null)
    const res = await getFechamentoConvenio({
      providerId,
      inicio: janela.inicio,
      fim:    janela.fim,
    })
    setCarregando(false)
    if ('error' in res) { setErro(res.error); setDados(null); return }
    setDados(res)
  }, [providerId, janelas, indice])

  useEffect(() => { void apurar() }, [apurar])

  if (convenios.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">
          Nenhum convênio ativo cadastrado. Cadastre em Gestão › Convênios, com o ciclo de
          fechamento e a regra do valor que o responsável paga.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden print:border-0">
      <header className="border-b border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
            <CalendarRange className="h-4 w-4 text-teal-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Fechamento do período</h2>
            <p className="text-xs text-slate-500">
              O que o convênio deve, apurado das OS — sem conferir uma a uma
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <select
            value={providerId}
            onChange={e => setProviderId(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            {convenios.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={indice}
            onChange={e => setIndice(Number(e.target.value))}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            {janelas.map((j, i) => (
              <option key={j.inicio} value={i}>
                {j.rotulo}{i === 0 ? ' (em curso)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => window.print()}
            disabled={!dados || dados.linhas.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </button>
        </div>
      </header>

      {erro && (
        <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 text-sm text-rose-700">{erro}</div>
      )}

      {carregando ? (
        <div className="px-6 py-12 flex items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !dados ? null : (
        <>
          {/* Cabeçalho do relatório: regra vigente à vista de quem confere */}
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs text-slate-600 space-y-0.5">
            <p>
              <span className="font-semibold text-slate-700">{dados.provider_name}</span>
              {' · '}{dataBr(dados.periodo.inicio)} a {dataBr(dados.periodo.fim)}
              {' · '}ciclo {ROTULO_CICLO[dados.ciclo].toLowerCase()}
            </p>
            <p className="text-slate-500">{dados.regra}</p>
          </div>

          {/* Totais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
            <Tile rotulo="OS no período" valor={String(dados.totais.os)} />
            <Tile rotulo="Valor total" valor={reais(dados.totais.total)} />
            <Tile rotulo="Pago pelo responsável" valor={reais(dados.totais.copay)} />
            <Tile rotulo="Devido pelo convênio" valor={reais(dados.totais.repass)} destaque />
          </div>

          {/* Confronto com o demonstrativo do convênio, quando já importado */}
          {dados.remessas.length > 0 && (
            <div className={`px-6 py-3 border-b text-sm flex items-start gap-2 ${
              dados.divergencia === 0
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : 'bg-amber-50 border-amber-100 text-amber-800'
            }`}>
              {dados.divergencia === 0
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                : <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="font-medium">
                  {dados.divergencia === 0
                    ? 'O demonstrativo do convênio bate com o apurado aqui.'
                    : `Diferença de ${reais(Math.abs(dados.divergencia ?? 0))} ${
                        (dados.divergencia ?? 0) > 0 ? 'a nosso favor' : 'a favor do convênio'}.`}
                </p>
                <p className="text-xs mt-0.5 opacity-80">
                  {dados.remessas.map(r => `${r.numero || 'sem nº'} (${reais(r.total_informado)})`).join(' · ')}
                </p>
              </div>
            </div>
          )}

          {dados.totais.com_pendencia > 0 && (
            <div className="px-6 py-3 bg-rose-50 border-b border-rose-100 text-sm text-rose-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                {dados.totais.com_pendencia} OS {dados.totais.com_pendencia === 1 ? 'tem item' : 'têm itens'} sem
                o split definido — o repasse delas está incompleto. Defina o valor no consultório ou
                configure a regra do convênio para não depender de digitação.
              </p>
            </div>
          )}

          {/* Linhas */}
          {dados.linhas.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">
              Nenhum atendimento deste convênio no período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="px-6 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">OS</th>
                    <th className="px-3 py-2 font-semibold">Animal / Responsável</th>
                    <th className="px-3 py-2 font-semibold text-right">Itens</th>
                    <th className="px-3 py-2 font-semibold text-right">Total</th>
                    <th className="px-3 py-2 font-semibold text-right">Responsável</th>
                    <th className="px-6 py-2 font-semibold text-right">Convênio deve</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dados.linhas.map(l => (
                    <tr key={l.consultation_id} className={l.split_pendente ? 'bg-rose-50/40' : undefined}>
                      <td className="px-6 py-2 text-slate-500 whitespace-nowrap">{dataBr(l.data)}</td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{l.os_number ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className="text-slate-800">{l.pet_nome ?? '—'}</span>
                        {l.tutor_nome && <span className="text-slate-400"> · {l.tutor_nome}</span>}
                        {l.split_pendente && (
                          <span className="ml-2 inline-flex text-[10px] font-semibold uppercase tracking-wide text-rose-700 bg-rose-100 border border-rose-200 rounded px-1.5 py-0.5">
                            split pendente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500">{l.itens}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{reais(l.total)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{reais(l.copay)}</td>
                      <td className="px-6 py-2 text-right font-semibold text-slate-900">{reais(l.repass)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                    <td className="px-6 py-3" colSpan={4}>Total</td>
                    <td className="px-3 py-3 text-right">{reais(dados.totais.total)}</td>
                    <td className="px-3 py-3 text-right">{reais(dados.totais.copay)}</td>
                    <td className="px-6 py-3 text-right">{reais(dados.totais.repass)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {dados.remessas.length === 0 && dados.linhas.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1.5 print:hidden">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Nenhum demonstrativo deste período importado ainda — importe para confrontar linha por linha.
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Tile({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="px-6 py-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-semibold ${destaque ? 'text-teal-700' : 'text-slate-900'}`}>{valor}</p>
    </div>
  )
}
