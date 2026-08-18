'use client'

import { useState } from 'react'
import { Lock, Unlock, Printer, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import {
  openCashierSession,
  closeCashierSession,
  getSessionExpectedTotals,
  type CashierSession,
  type CashierClosingReport,
} from '@/lib/actions/cashier-sessions'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const MODULE_LABELS: Record<string, string> = {
  grooming: 'Banho e Tosa', pharmacy: 'Farmácia',
  consultation: 'Consulta', exam: 'Exame',
  manual: 'Manual', adjustment: 'Ajuste', sales: 'PDV',
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX', credit: 'Crédito', debit: 'Débito',
  cash: 'Dinheiro', convenio: 'Convênio', transfer: 'Transferência', courtesy: 'Cortesia', other: 'Outro',
  nao_informado: 'Não informado',
}

// Formas que o operador confere no fechamento cego
const CONFERENCE_METHODS = ['cash', 'pix', 'credit', 'debit'] as const

interface Props {
  session:    CashierSession | null
  userRole:   string
  onRefresh:  () => void
  onToast:    (msg: string, type: 'success' | 'error') => void
}

type Expected = {
  opening_balance: number
  by_method: Record<string, number>
  total_inflows: number
  total_outflows: number
  expected_cash: number
  expected_total: number
}

export default function CashierSessionControl({ session, userRole, onRefresh, onToast }: Props) {
  const [loading,       setLoading]       = useState(false)
  const [openBalance,   setOpenBalance]   = useState('0')
  const [showOpenForm,  setShowOpenForm]  = useState(false)
  const [closingReport, setClosingReport] = useState<CashierClosingReport | null>(null)

  // ── Fechamento com conferência cega ──
  const [conferenceOpen, setConferenceOpen] = useState(false)
  const [expected,       setExpected]       = useState<Expected | null>(null)
  const [counted,        setCounted]        = useState<Record<string, string>>({})
  const [revealed,       setRevealed]       = useState(false)
  const [closingNotes,   setClosingNotes]   = useState('')

  const canManage = ['admin', 'owner', 'manager'].includes(userRole)

  async function handleOpen() {
    const balance = parseFloat(openBalance.replace(',', '.'))
    if (isNaN(balance) || balance < 0) {
      onToast('Saldo de abertura inválido', 'error')
      return
    }
    setLoading(true)
    const res = await openCashierSession(balance)
    setLoading(false)
    if ('error' in res) { onToast(res.error, 'error'); return }
    onToast('Caixa aberto com sucesso!', 'success')
    setShowOpenForm(false)
    onRefresh()
  }

  // Passo 1: abre a conferência cega (carrega o esperado, mas NÃO mostra ainda)
  async function startConference() {
    if (!session) return
    setLoading(true)
    const res = await getSessionExpectedTotals(session.id)
    setLoading(false)
    if ('error' in res) { onToast(res.error, 'error'); return }
    setExpected(res)
    setCounted({})
    setRevealed(false)
    setClosingNotes('')
    setConferenceOpen(true)
  }

  const countedNum = (m: string) => parseFloat((counted[m] ?? '').replace(',', '.')) || 0
  const countedTotal = CONFERENCE_METHODS.reduce((s, m) => s + countedNum(m), 0)
  // Esperado por forma: dinheiro inclui fundo de troco e desconta saídas (gaveta)
  const expectedFor = (m: string) =>
    !expected ? 0 : m === 'cash' ? expected.expected_cash : (expected.by_method[m] ?? 0)
  const expectedConferenceTotal = expected
    ? CONFERENCE_METHODS.reduce((s, m) => s + expectedFor(m), 0)
    : 0
  const difference = countedTotal - expectedConferenceTotal
  const hasDivergence = Math.abs(difference) >= 0.01
  // Um esperado fisicamente impossível (dinheiro/total negativo) indica
  // inconsistência interna de dados — NÃO erro na contagem do operador.
  // Sinalizamos isso para não responsabilizar quem está fechando o caixa.
  const suspiciousExpected = !!expected &&
    (expected.expected_cash < -0.01 || expectedConferenceTotal < -0.01)

  // Passo 2: revela o esperado e a divergência
  function reveal() { setRevealed(true) }

  // Passo 3: confirma o fechamento
  async function confirmClose() {
    if (!session) return
    if (hasDivergence && !closingNotes.trim()) {
      onToast('Há divergência — explique o motivo antes de fechar.', 'error')
      return
    }
    setLoading(true)
    const byMethod: Record<string, number> = {}
    for (const m of CONFERENCE_METHODS) byMethod[m] = countedNum(m)
    const res = await closeCashierSession(session.id, {
      counted_by_method: byMethod,
      closing_notes: closingNotes.trim() || undefined,
    })
    setLoading(false)
    if ('error' in res) { onToast(res.error, 'error'); return }
    setConferenceOpen(false)
    setClosingReport(res)
    onToast('Caixa fechado com sucesso!', 'success')
    onRefresh()
  }

  function printReport() {
    window.print()
  }

  // ── Modal: conferência cega ──
  if (conferenceOpen && expected && session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-scale-in" data-mentor-step="cashier-conferencia">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Fechar o Caixa — Conferência</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {revealed
                ? 'Compare o que você contou com o que o sistema esperava.'
                : 'Conte o que há no caixa e digite abaixo, SEM olhar os totais do sistema. Isso garante uma conferência honesta (fechamento cego).'}
            </p>
          </div>

          <div className="space-y-2.5">
            {CONFERENCE_METHODS.map(m => {
              const exp = expectedFor(m)
              const diff = countedNum(m) - exp
              return (
                <div key={m} className="flex items-center gap-3">
                  <label className="w-24 text-sm font-medium text-slate-700">
                    {PAYMENT_LABELS[m]}
                    {m === 'cash' && <span className="block text-[10px] text-slate-400 font-normal">na gaveta</span>}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={counted[m] ?? ''}
                    onChange={e => setCounted(prev => ({ ...prev, [m]: e.target.value }))}
                    disabled={revealed}
                    placeholder="0,00"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-right font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:bg-slate-50"
                  />
                  {revealed && (
                    <div className="w-36 text-right text-sm">
                      <span className="text-slate-500 font-mono tabular-nums">{fmt(exp)}</span>
                      {Math.abs(diff) >= 0.01 && (
                        <span className={`block text-xs font-semibold font-mono tabular-nums ${diff > 0 ? 'text-sky-600' : 'text-red-600'}`}>
                          {diff > 0 ? 'sobra' : 'falta'} {fmt(Math.abs(diff))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {revealed && suspiciousExpected && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">
                  Valor esperado inconsistente — provável problema no sistema
                </p>
              </div>
              <p className="text-xs text-amber-700 mt-1.5">
                O sistema esperava um valor impossível (dinheiro/total negativo). Isso
                normalmente indica vendas não vinculadas a esta sessão — <strong>não</strong> um
                erro na sua contagem. Você pode fechar mesmo assim com uma observação e
                avisar o suporte para conferência.
              </p>
            </div>
          )}

          {revealed && (
            <div className={`rounded-xl border p-4 ${hasDivergence ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className="flex items-center gap-2">
                {hasDivergence
                  ? <AlertTriangle className="h-5 w-5 text-amber-600" />
                  : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                <p className="text-sm font-semibold text-slate-800">
                  {hasDivergence
                    ? <>Divergência de <span className="font-mono tabular-nums">{fmt(Math.abs(difference))}</span> ({difference > 0 ? 'sobrou' : 'faltou'})</>
                    : 'O caixa bateu! Contado = esperado.'}
                </p>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                Você contou <span className="font-mono tabular-nums">{fmt(countedTotal)}</span> · o sistema esperava <span className="font-mono tabular-nums">{fmt(expectedConferenceTotal)}</span>
                {' '}(fundo de troco <span className="font-mono tabular-nums">{fmt(expected.opening_balance)}</span> já incluso no dinheiro).
              </p>
              {hasDivergence && (
                <>
                  <p className="text-xs text-slate-600 mt-2">
                    {difference > 0
                      ? 'Sobrou dinheiro: confira se algum recebimento não foi lançado ou se o troco foi dado a menor.'
                      : 'Faltou dinheiro: confira troco dado a maior, sangria não registrada ou comprovante de cartão não lançado.'}
                    {' '}Confira por forma de pagamento acima para localizar onde está a diferença.
                  </p>
                  <textarea
                    value={closingNotes}
                    onChange={e => setClosingNotes(e.target.value)}
                    placeholder="Explique a divergência (obrigatório): ex. troco dado errado, comprovante de cartão não lançado..."
                    rows={2}
                    className="mt-3 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                  />
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setConferenceOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Cancelar
            </button>
            {!revealed ? (
              <button
                onClick={reveal}
                className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
              >
                Conferir contagem
              </button>
            ) : (
              <button
                onClick={confirmClose}
                disabled={loading || (hasDivergence && !closingNotes.trim())}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60 transition-colors"
              >
                {loading ? <Spinner /> : <Lock className="h-4 w-4" />}
                Confirmar fechamento
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Modal: relatório de fechamento (comprovante imprimível) ──
  if (closingReport) {
    const cr = closingReport
    const diff = cr.session.difference
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:relative print:bg-white print:p-0">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-scale-in print:shadow-none print:max-h-none print:rounded-none" id="closing-report-print">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-lg font-bold text-slate-900">Comprovante de Fechamento</h2>
            <button
              onClick={() => { setClosingReport(null); onRefresh() }}
              className="text-slate-400 hover:text-slate-600 text-xl font-bold"
            >×</button>
          </div>
          <div className="hidden print:block text-center border-b border-slate-300 pb-3">
            <h2 className="text-lg font-bold">Comprovante de Fechamento de Caixa</h2>
            <p className="text-xs text-slate-500">
              {new Date().toLocaleString('pt-BR')}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Entradas</p>
              <p className="text-base font-bold text-emerald-700 font-mono tabular-nums">{fmt(cr.total_inflows)}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Saídas</p>
              <p className="text-base font-bold text-red-600 font-mono tabular-nums">{fmt(cr.total_outflows)}</p>
            </div>
            <div className="rounded-xl bg-sky-50 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Saldo Final</p>
              <p className="text-base font-bold text-sky-700 font-mono tabular-nums">{fmt(cr.net_balance)}</p>
            </div>
          </div>

          {diff != null && (
            <div className={`rounded-xl border p-3 text-sm flex items-center gap-2 ${
              Math.abs(diff) >= 0.01 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              {Math.abs(diff) >= 0.01
                ? <><AlertTriangle className="h-4 w-4" /> Conferência: {diff > 0 ? 'sobra' : 'falta'} de <span className="font-mono tabular-nums">{fmt(Math.abs(diff))}</span> (contado <span className="font-mono tabular-nums">{fmt(cr.session.counted_total ?? 0)}</span>)</>
                : <><CheckCircle2 className="h-4 w-4" /> Conferência: o caixa bateu (<span className="font-mono tabular-nums">{fmt(cr.session.counted_total ?? 0)}</span> contado)</>}
            </div>
          )}
          {cr.session.closing_notes && (
            <p className="text-xs text-slate-500 italic">Justificativa: {cr.session.closing_notes}</p>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Por Módulo</p>
            <div className="space-y-1.5">
              {Object.entries(cr.by_module).map(([mod, data]) => (
                <div key={mod} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{MODULE_LABELS[mod] ?? mod}</span>
                  <span className="font-semibold text-slate-900 font-mono tabular-nums">{fmt(data.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Por Forma de Pagamento</p>
            <div className="space-y-1.5">
              {Object.entries(cr.by_payment_method).map(([method, data]) => (
                <div key={method} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{PAYMENT_LABELS[method] ?? method}</span>
                  <div className="text-right">
                    <span className="font-semibold text-slate-900 font-mono tabular-nums">{fmt(data.amount)}</span>
                    <span className="text-xs text-slate-400 ml-1 font-mono tabular-nums">({data.count})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 print:hidden">
            <button
              onClick={printReport}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              onClick={() => { setClosingReport(null); onRefresh() }}
              className="flex-1 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
            >
              Fechar Relatório
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!canManage) return null

  // No session open
  if (!session) {
    return (
      <div data-mentor-step="cashier-session-control" className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Caixa Fechado</p>
            <p className="text-xs text-amber-600">Abra o caixa para registrar movimentações do dia</p>
          </div>
        </div>
        {!showOpenForm ? (
          <button
            onClick={() => setShowOpenForm(true)}
            data-mentor-step="cashier-abrir-caixa"
            className="flex-shrink-0 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
          >
            Abrir Caixa
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div>
              <label className="text-[10px] text-amber-700 font-semibold block mb-0.5">Fundo de Troco</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openBalance}
                onChange={e => setOpenBalance(e.target.value)}
                className="w-28 rounded-lg border border-amber-200 px-2.5 py-1.5 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                placeholder="0,00"
              />
            </div>
            <button
              onClick={handleOpen}
              disabled={loading}
              className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60 transition-colors"
            >
              {loading ? <Spinner /> : 'Confirmar'}
            </button>
            <button
              onClick={() => setShowOpenForm(false)}
              className="text-xs text-amber-600 hover:text-amber-800"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    )
  }

  // Session is open
  return (
    <div data-mentor-step="cashier-session-control" className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Unlock className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Caixa Aberto</p>
          <p className="text-xs text-emerald-600">
            Fundo: <span className="font-mono tabular-nums">{fmt(session.opening_balance)}</span> · Aberto às{' '}
            <span className="font-mono tabular-nums">{new Date(session.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </p>
        </div>
      </div>
      <button
        onClick={startConference}
        disabled={loading}
        data-mentor-step="cashier-fechar-caixa"
        title="Abre a conferência: você conta o caixa às cegas e o sistema compara com o esperado."
        className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60 transition-colors"
      >
        {loading ? <Spinner size="sm" /> : <Lock className="h-3.5 w-3.5" />}
        Fechar Caixa
      </button>
    </div>
  )
}
