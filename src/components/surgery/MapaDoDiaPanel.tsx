'use client'

// Mapa das cirurgias do dia (Fase 4 · item 4.3).
//
// Substitui o quadro que o Vinícius mantém à mão. Mostra mais do que horário de
// propósito: pendência do pré-anestésico, liberação forçada e kit sem conferir
// são o que custa dinheiro ou segurança quando passa batido, e é olhando o mapa
// que se decide o que fazer no dia.

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarClock, Loader2, AlertTriangle, ShieldAlert, PackageCheck, Printer, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { getMapaDoDia } from '@/lib/actions/surgery-mapa'
import type { MapaDoDia, LinhaDoMapa } from '@/types/estoque-reposicao'

const ROTULO_STATUS: Record<LinhaDoMapa['status'], string> = {
  preparo: 'Preparo', sala: 'Em sala', rpa: 'RPA', done: 'Concluída', canceled: 'Cancelada',
}

const COR_STATUS: Record<LinhaDoMapa['status'], string> = {
  preparo:  'bg-slate-100 text-slate-600 border-slate-200',
  sala:     'bg-teal-50 text-teal-700 border-teal-200',
  rpa:      'bg-indigo-50 text-indigo-700 border-indigo-200',
  done:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  canceled: 'bg-rose-50 text-rose-700 border-rose-200',
}

/** Soma dias a 'YYYY-MM-DD' sem passar por fuso. */
function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const base = Date.UTC(a, m - 1, d) + dias * 86400000
  return new Date(base).toISOString().slice(0, 10)
}

function hojeLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export default function MapaDoDiaPanel({ dataInicial }: { dataInicial?: string }) {
  const [dia, setDia]           = useState(dataInicial ?? hojeLocal())
  const [mapa, setMapa]         = useState<MapaDoDia | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro]         = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const res = await getMapaDoDia(dia)
    setCarregando(false)
    if ('error' in res) { setErro(res.error); setMapa(null); return }
    setMapa(res)
  }, [dia])

  useEffect(() => { void carregar() }, [carregar])

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <header className="border-b border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
            <CalendarClock className="h-4 w-4 text-teal-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Mapa do dia</h2>
            <p className="text-xs text-slate-500">
              {mapa
                ? `${mapa.totais.total} cirurgia(s) · ${mapa.totais.em_sala} em sala · ${mapa.totais.concluidas} concluída(s)`
                : 'Cirurgias previstas e o que falta em cada uma'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 print:hidden">
          <button onClick={() => setDia(d => somarDias(d, -1))} title="Dia anterior"
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" value={dia} onChange={e => setDia(e.target.value || hojeLocal())}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500/20" />
          <button onClick={() => setDia(d => somarDias(d, 1))} title="Dia seguinte"
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <ChevronRight className="h-4 w-4" />
          </button>
          {dia !== hojeLocal() && (
            <button onClick={() => setDia(hojeLocal())}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Hoje
            </button>
          )}
          <button onClick={() => window.print()} disabled={!mapa || mapa.linhas.length === 0} title="Imprimir"
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </header>

      {erro && <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 text-sm text-rose-700">{erro}</div>}

      {mapa && mapa.totais.bloqueadas > 0 && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            {mapa.totais.bloqueadas} cirurgia(s) com pré-anestésico incompleto — não vão para a sala
            sem liberação com motivo.
          </p>
        </div>
      )}

      {carregando ? (
        <div className="px-6 py-12 flex items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !mapa || mapa.linhas.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-slate-400">
          Nenhuma cirurgia em {dataBr(dia)}.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {mapa.linhas.map(l => (
            <li key={l.id} className="px-6 py-3 flex items-start gap-4">
              <div className="w-14 flex-shrink-0 pt-0.5">
                <p className="text-sm font-semibold tabular-nums text-slate-900">{l.hora ?? '—'}</p>
                {l.duracao_min && <p className="text-[10px] text-slate-400">{l.duracao_min} min</p>}
                {!l.hora && <p className="text-[10px] text-amber-600">encaixe</p>}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-semibold text-slate-800">{l.procedure_name}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${COR_STATUS[l.status]}`}>
                    {ROTULO_STATUS[l.status]}
                  </span>
                  {l.asa_risk && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                      {l.asa_risk}
                    </span>
                  )}
                  {l.liberada_a_forca && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                      <ShieldAlert className="h-2.5 w-2.5" /> liberada com motivo
                    </span>
                  )}
                  {l.kits_pendentes > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                      <PackageCheck className="h-2.5 w-2.5" /> {l.kits_pendentes} kit(s) a conferir
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 mt-0.5">
                  {[l.pet_nome, l.especie, l.tutor_nome].filter(Boolean).join(' · ') || 'Paciente não informado'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {[
                    l.sala ? `Sala: ${l.sala}` : null,
                    l.cirurgiao ? `MV: ${l.cirurgiao}` : null,
                    l.anestesista ? `Anestesia: ${l.anestesista}` : null,
                  ].filter(Boolean).join(' · ') || 'Sem sala e equipe definidas'}
                </p>

                {l.bloqueios.length > 0 && (
                  <p className="mt-1 text-[11px] text-rose-700 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    Falta para ir à sala: {l.bloqueios.join(', ')}.
                  </p>
                )}
                {l.bloqueios.length === 0 && l.avisos.length > 0 && l.status === 'preparo' && (
                  <p className="mt-1 text-[11px] text-slate-400">Pendente: {l.avisos.join(', ')}.</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
