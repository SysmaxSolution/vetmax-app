'use client'

// Livro de Controlados (1.7) — Livro de Registro Específico (Portaria 344/1998).
// Tela no mesmo layout da folha fiscal: DATA | HISTÓRICO (Pet-Responsável,
// Procedimento, Nº OS) | MOVIMENTO (Entrada, Saída, Perdas) | ESTOQUE | OBS.
// Exporta em Excel (abas: Resumo, Saldo inicial, Perdas, Lançamentos gerais e
// uma por medicamento) e em PDF para a Vigilância.

import { useState, useTransition } from 'react'
import { getControlledBook, salvarResponsavelTecnico } from '@/lib/actions/controlled-book'
import type { ControlledBook, ControlledItemBook } from '@/types/controlled-book'
import { montarFolha, montarResumo, dataBR } from '@/lib/controlled/livro-fiscal'

const fmtQty = (v: number | null | undefined) => v == null ? '' : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export default function ControlledBookReport() {
  const today = new Date().toISOString().split('T')[0]
  const inicioDoAno = today.slice(0, 4) + '-01-01'
  const oneYearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0] })()

  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo] = useState(today)
  const [book, setBook] = useState<ControlledBook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run(f = from, t = to) {
    startT(async () => {
      setError(null)
      const res = await getControlledBook({ from: f, to: t })
      if ('error' in res) { setError(res.error); return }
      setBook(res)
    })
  }

  const exportUrl = (format: 'xlsx' | 'pdf') => `/api/reports/controlled-book?format=${format}&from=${from}&to=${to}`

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end print:hidden">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run()} disabled={pending}
            className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60">
            {pending ? 'Carregando…' : 'Gerar'}
          </button>
          <button onClick={() => { setFrom(inicioDoAno); setTo(today); run(inicioDoAno, today) }} disabled={pending}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Ano corrente
          </button>
          <button onClick={() => { setFrom(oneYearAgo); setTo(today); run(oneYearAgo, today) }} disabled={pending}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Últimos 12 meses
          </button>
          {book && (
            <>
              <a href={exportUrl('xlsx')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
                Baixar Excel (livro por aba)
              </a>
              <a href={exportUrl('pdf')} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Baixar PDF (Vigilância)
              </a>
            </>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 print:hidden">{error}</div>}

      {book === null && !pending && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500 print:hidden">
          Selecione o período e clique em Gerar. “Ano corrente” monta o livro do ano para a Vigilância.
        </div>
      )}

      {book && (
        <div className="space-y-6">
          <CabecalhoLivro book={book} onSaved={() => run()} />

          {book.veterinary.length === 0 && book.human.length === 0 && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Nenhum medicamento controlado com movimento no período. Marque os itens como “Controlado” e preencha a substância no cadastro do estoque.
            </div>
          )}

          <ResumoSaldos book={book} />
          <BookSection title="Forma Farmacêutica Humana" items={book.human} from={book.from} />
          <BookSection title="Forma Farmacêutica Veterinária" items={book.veterinary} from={book.from} />
        </div>
      )}
    </div>
  )
}

function CabecalhoLivro({ book, onSaved }: { book: ControlledBook; onSaved: () => void }) {
  const c = book.clinic
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(c.technical_responsible_name ?? '')
  const [crmv, setCrmv] = useState(c.technical_responsible_crmv ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    setSalvando(true); setErro(null)
    const res = await salvarResponsavelTecnico({ name: nome, crmv })
    setSalvando(false)
    if ('error' in res) { setErro(res.error); return }
    setEditando(false)
    onSaved()
  }

  const endereco = [c.address, c.city && c.state ? `${c.city}/${c.state}` : (c.city ?? c.state)].filter(Boolean).join(' · ')
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">Livro de Registro Específico de Medicamentos Sujeitos a Controle Especial</h2>
          <p className="text-sm text-slate-600 truncate">{c.name}{c.cnpj ? ` · CNPJ ${c.cnpj}` : ''}{endereco ? ` · ${endereco}` : ''}</p>
          <p className="text-xs text-slate-500">Período: {dataBR(book.from)} a {dataBR(book.to)} · Portaria SVS/MS 344/1998</p>
        </div>
        <div className="text-sm sm:text-right">
          {!editando ? (
            <>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Responsável técnico</p>
              <p className="font-medium text-slate-800">{c.technical_responsible_name ?? <span className="text-amber-700">não informado</span>}{c.technical_responsible_crmv ? ` · ${c.technical_responsible_crmv}` : ''}</p>
              <button onClick={() => setEditando(true)} className="text-xs text-teal-700 hover:underline print:hidden">alterar</button>
            </>
          ) : (
            <div className="flex flex-col gap-1.5 print:hidden">
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do responsável técnico (MV)"
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm w-64" />
              <input value={crmv} onChange={e => setCrmv(e.target.value)} placeholder="CRMV-SP 00000"
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm w-64" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditando(false)} className="text-xs text-slate-500 hover:underline">cancelar</button>
                <button onClick={salvar} disabled={salvando} className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{salvando ? 'Salvando…' : 'Salvar'}</button>
              </div>
              {erro && <p className="text-xs text-red-600">{erro}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResumoSaldos({ book }: { book: ControlledBook }) {
  const resumo = montarResumo(book)
  if (resumo.length === 0) return null
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-700">Resumo de saldos</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] text-slate-400 uppercase tracking-wide border-y border-slate-100">
            <tr>
              <th className="text-left px-4 py-2">Medicamento</th>
              <th className="text-left px-2 py-2">Unidade</th>
              <th className="text-right px-2 py-2">Saldo inicial</th>
              <th className="text-right px-2 py-2">Entradas</th>
              <th className="text-right px-2 py-2">Saídas</th>
              <th className="text-right px-2 py-2">Perdas</th>
              <th className="text-right px-4 py-2">Saldo final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {resumo.map(r => (
              <tr key={r.medicamento}>
                <td className="px-4 py-1.5 font-medium text-slate-800">{r.medicamento}</td>
                <td className="px-2 py-1.5 text-slate-500">{r.unidade}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtQty(r.saldo_inicial)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-emerald-700">{fmtQty(r.entradas)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-rose-600">{fmtQty(r.saidas)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-amber-600">{fmtQty(r.perdas)}</td>
                <td className="px-4 py-1.5 text-right font-mono font-bold">{fmtQty(r.saldo_final)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BookSection({ title, items, from }: { title: string; items: ControlledItemBook[]; from: string }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1">{title}</h3>
      {items.map(item => <ItemBook key={item.stock_item_id} item={item} from={from} />)}
    </div>
  )
}

function ItemBook({ item, from }: { item: ControlledItemBook; from: string }) {
  const [open, setOpen] = useState(false)
  const folha = montarFolha(item)
  const unit = folha.unidade
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50/60 hover:bg-slate-50 text-left">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">
            {folha.substancia}
            {folha.concentracao && <span className="text-slate-400 font-normal"> · {folha.concentracao}</span>}
            {folha.classe && <span className="ml-2 text-[10px] font-bold uppercase rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5">{folha.classe}</span>}
            <span className="ml-2 text-[10px] uppercase text-slate-400">{unit}</span>
          </p>
          {item.substance && item.substance !== item.name && <p className="text-xs text-slate-400 truncate">{item.name}</p>}
        </div>
        <div className="flex items-center gap-4 text-xs flex-shrink-0">
          <Stat label="Inicial" value={fmtQty(folha.saldo_anterior)} />
          <Stat label="Entradas" value={`+${fmtQty(folha.total_entradas)}`} color="text-emerald-700" />
          <Stat label="Saídas" value={`−${fmtQty(folha.total_saidas)}`} color="text-rose-600" />
          {folha.total_perdas > 0 && <Stat label="Perdas" value={`−${fmtQty(folha.total_perdas)}`} color="text-amber-600" />}
          <Stat label="Saldo" value={fmtQty(folha.saldo_final)} color="text-slate-900" bold />
          <span className="text-slate-400">{open ? '▴' : '▾'}</span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white text-[10px] text-slate-400 uppercase tracking-wide border-y border-slate-100">
              <tr>
                <th className="text-left px-4 py-2" rowSpan={2}>Data</th>
                <th className="text-center px-2 py-1 border-b border-slate-100" colSpan={3}>Histórico</th>
                <th className="text-center px-2 py-1 border-b border-slate-100" colSpan={3}>Movimento</th>
                <th className="text-right px-2 py-2" rowSpan={2}>Estoque</th>
                <th className="text-left px-4 py-2" rowSpan={2}>Observações</th>
              </tr>
              <tr>
                <th className="text-left px-2 py-1">Pet-Responsável</th>
                <th className="text-left px-2 py-1">Procedimento</th>
                <th className="text-left px-2 py-1">Nº OS</th>
                <th className="text-right px-2 py-1">Entrada</th>
                <th className="text-right px-2 py-1">Saída</th>
                <th className="text-right px-2 py-1">Perdas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <tr className="text-slate-400 bg-slate-50/40">
                <td className="px-4 py-1.5" colSpan={7}>Saldo anterior em {dataBR(from)}</td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmtQty(folha.saldo_anterior)}</td>
                <td className="px-4 py-1.5"></td>
              </tr>
              {folha.linhas.map((l, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="px-4 py-1.5 whitespace-nowrap text-slate-500">{l.data}{l.hora && l.hora !== '08:00' ? <span className="text-slate-300"> {l.hora}</span> : null}</td>
                  <td className="px-2 py-1.5 text-slate-700 max-w-[200px] truncate">{l.pet_responsavel}</td>
                  <td className="px-2 py-1.5 text-slate-600 max-w-[260px] truncate">{l.procedimento}</td>
                  <td className="px-2 py-1.5 text-slate-500 font-mono">{l.os}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-emerald-700">{fmtQty(l.entrada)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-rose-600">{fmtQty(l.saida)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-amber-600">{fmtQty(l.perdas)}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmtQty(l.estoque)}</td>
                  <td className="px-4 py-1.5 text-slate-500 max-w-[240px] truncate">{[l.observacoes, l.responsavel ? `Reg.: ${l.responsavel}` : null].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-1.5" colSpan={4}>Totais do período</td>
                <td className="px-2 py-1.5 text-right font-mono text-emerald-700">{fmtQty(folha.total_entradas)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-rose-600">{fmtQty(folha.total_saidas)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-amber-600">{fmtQty(folha.total_perdas)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtQty(folha.saldo_final)}</td>
                <td className="px-4 py-1.5"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-slate-700', bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="text-right">
      <span className="block text-[9px] text-slate-400 uppercase">{label}</span>
      <span className={`font-mono tabular-nums ${color} ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  )
}
