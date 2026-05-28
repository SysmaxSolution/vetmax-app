'use client'

import { useEffect, useState } from 'react'
import {
  Receipt, Loader2, Plus, Trash2, ArrowRightLeft, CheckCircle2,
  Stethoscope, LogOut, Lock,
} from 'lucide-react'
import {
  getHospitalizationAccount, settleHospitalizationAccount, addManualCharge, voidCharge,
  giveMedicalDischarge, type HospAccount, type ChargeKind, type ChargeStatus,
} from '@/lib/actions/hospitalization-charges'
import { confirmDischarge } from '@/lib/actions/hospitalizations'

/**
 * Aba "Conta" do card de internação (Internação Completa, Regra 4).
 * Centraliza custos (diárias, medicações aplicadas, itens manuais) e implementa
 * a máquina de estado de alta: Alta Médica → ready_for_discharge; Alta
 * Administrativa → discharged, habilitada só com a conta liquidada/transferida.
 */

interface Props {
  hospitalizationId: string
  consultationId:    string | null
  status:            string
  /** Chamado após Alta Médica/Administrativa para o board recarregar/fechar. */
  onStatusChanged?:  (newStatus: string) => void
}

const KIND_LABEL: Record<ChargeKind, string> = {
  daily: 'Diária', medication: 'Medicação', kit: 'Kit', procedure: 'Procedimento', exam: 'Exame', other: 'Item',
}
const STATUS_BADGE: Record<ChargeStatus, { label: string; cls: string }> = {
  open:        { label: 'Em aberto',   cls: 'bg-amber-100 text-amber-700' },
  transferred: { label: 'PDV',         cls: 'bg-sky-100 text-sky-700' },
  paid:        { label: 'Pago',        cls: 'bg-emerald-100 text-emerald-700' },
  void:        { label: 'Cancelado',   cls: 'bg-slate-100 text-slate-400' },
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ContaTab({ hospitalizationId, consultationId, status, onStatusChanged }: Props) {
  const [account, setAccount] = useState<HospAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // form item manual
  const [desc, setDesc] = useState('')
  const [val,  setVal]  = useState('')

  async function reload() {
    const res = await getHospitalizationAccount(hospitalizationId)
    if (!('error' in res)) setAccount(res)
    setLoading(false)
  }
  useEffect(() => { void reload() }, [hospitalizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSettle(method: 'pdv' | 'paid') {
    setBusy(true); setError(null)
    const res = await settleHospitalizationAccount(hospitalizationId, method)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    await reload()
  }

  async function handleAddManual() {
    setError(null)
    const unit = parseFloat((val || '').replace(',', '.'))
    if (!desc.trim()) { setError('Informe a descrição do item.'); return }
    if (!Number.isFinite(unit) || unit < 0) { setError('Informe um valor válido.'); return }
    setBusy(true)
    const res = await addManualCharge({ hospitalization_id: hospitalizationId, kind: 'procedure', description: desc.trim(), unit_amount: unit })
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setDesc(''); setVal('')
    await reload()
  }

  async function handleVoid(id: string) {
    setBusy(true); await voidCharge(id); setBusy(false); await reload()
  }

  async function handleMedicalDischarge() {
    setBusy(true); setError(null)
    const res = await giveMedicalDischarge(hospitalizationId)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    onStatusChanged?.('ready_for_discharge')
  }

  async function handleAdministrativeDischarge() {
    setBusy(true); setError(null)
    const res = await confirmDischarge(hospitalizationId, consultationId)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    onStatusChanged?.('discharged')
  }

  const balance = account?.balance ?? 0
  const settled = balance <= 0
  const isReadyForDischarge = status === 'ready_for_discharge'

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5" data-testid="conta-tab">

      {/* Saldo */}
      <div className={`rounded-2xl border-2 px-4 py-3 ${balance > 0 ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-70 flex items-center gap-1"><Receipt className="h-3 w-3" /> Saldo da Internação</p>
            <p className={`text-2xl font-bold tabular-nums ${balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{fmtBRL(balance)}</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Liquidado: <span className="font-semibold tabular-nums">{fmtBRL(account?.settled ?? 0)}</span></p>
            <p>Total: <span className="font-semibold tabular-nums">{fmtBRL(account?.total ?? 0)}</span></p>
          </div>
        </div>
        {balance > 0 && (
          <div className="mt-2 flex gap-2">
            <button onClick={() => handleSettle('pdv')} disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Transferir para PDV
            </button>
            <button onClick={() => handleSettle('paid')} disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50">
              <CheckCircle2 className="h-3.5 w-3.5" /> Liquidar
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

      {/* Lançamento manual (procedimentos/exames) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Lançar Item</h3>
        <div className="flex items-center gap-2">
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Radiografia, Curativo..."
            className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none" />
          <input type="number" inputMode="decimal" step="0.01" value={val} onChange={e => setVal(e.target.value)} placeholder="R$"
            className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none" />
          <button onClick={handleAddManual} disabled={busy}
            className="flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> Lançar
          </button>
        </div>
      </div>

      {/* Itens da conta */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Itens da Conta</h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : !account || account.charges.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-4">Nenhum lançamento na conta.</p>
        ) : (
          <div className="space-y-1.5">
            {account.charges.map(c => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <span className="font-semibold text-slate-500 w-20">{KIND_LABEL[c.kind]}</span>
                <span className="flex-1 min-w-0 truncate text-slate-700">{c.description}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[c.status].cls}`}>{STATUS_BADGE[c.status].label}</span>
                <span className="font-bold tabular-nums text-slate-900 w-20 text-right">{fmtBRL(c.amount)}</span>
                {c.status === 'open' && c.kind !== 'daily' && (
                  <button onClick={() => handleVoid(c.id)} disabled={busy} className="text-slate-300 hover:text-rose-500 disabled:opacity-50" title="Cancelar item">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Máquina de Estado de Alta */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Alta</h3>
        {!isReadyForDischarge ? (
          <>
            <p className="text-xs text-slate-500">A <strong>Alta Médica</strong> cessa diárias e aprazamento de medicações. O paciente permanece no Kanban até a Alta Administrativa.</p>
            <button onClick={handleMedicalDischarge} disabled={busy}
              data-testid="btn-alta-medica"
              className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />} Dar Alta Médica
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Alta médica concedida. A <strong>Alta Administrativa</strong> encerra a internação e só é liberada com a conta zerada.
            </p>
            <button
              onClick={handleAdministrativeDischarge}
              disabled={busy || !settled}
              data-testid="btn-alta-administrativa"
              title={settled ? 'Encerrar internação' : `Conta pendente: ${fmtBRL(balance)} — liquide ou transfira para o PDV`}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${
                settled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : settled ? <LogOut className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {settled ? 'Alta Administrativa' : `Conta pendente: ${fmtBRL(balance)}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
