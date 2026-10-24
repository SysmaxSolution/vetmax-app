'use client'

import { useEffect, useState } from 'react'
import {
  Receipt, Loader2, Plus, Trash2, ArrowRightLeft, CheckCircle2,
  Stethoscope, LogOut, Lock, Syringe, Undo2, Clock,
} from 'lucide-react'
import { getHospitalizationAccount, settleHospitalizationAccount, addManualCharge, voidCharge, giveMedicalDischarge } from '@/lib/actions/hospitalization-charges'
import type { HospAccount, ChargeKind, ChargeStatus } from '@/types/hospitalization-charges'
import { confirmDischarge, sendToVetReview } from '@/lib/actions/hospitalizations'
import { sendHospitalizationToSurgery } from '@/lib/actions/hospitalization-surgery'
import { listSurgicalServices } from '@/lib/actions/service-surgery-config'
import type { SurgicalServiceOption } from '@/types/service-surgery'

/**
 * Aba "Conta" do card de internação (Internação Completa, Regra 4).
 *
 * Centraliza custos (diárias, medicações aplicadas, itens manuais) e os
 * ENCAMINHAMENTOS do pet internado: centro cirúrgico, devolver ao MV, enviar
 * a conta ao caixa (em partes — a conta continua aberta para novos itens) e a
 * máquina de alta: Alta Médica → ready_for_discharge; Alta Administrativa →
 * discharged, liberada só com nada em aberto.
 */
interface Props {
  hospitalizationId: string
  consultationId:    string | null
  status:            string
  /** Chamado após Alta Médica/Administrativa/devolução para o board recarregar/fechar. */
  onStatusChanged?:  (newStatus: string) => void
}

const KIND_LABEL: Record<ChargeKind, string> = {
  daily: 'Diária', medication: 'Medicação', kit: 'Kit', procedure: 'Procedimento', exam: 'Exame', other: 'Item',
}

const STATUS_BADGE: Record<ChargeStatus, { label: string; cls: string }> = {
  open:        { label: 'Em aberto',   cls: 'bg-amber-100 text-amber-700' },
  transferred: { label: 'No caixa',    cls: 'bg-sky-100 text-sky-700' },
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
  const [aviso, setAviso]     = useState<string | null>(null)

  // form item manual
  const [desc, setDesc] = useState('')
  const [val,  setVal]  = useState('')

  // encaminhamento ao centro cirúrgico
  const [cirurgiaAberta, setCirurgiaAberta] = useState(false)
  const [servicos, setServicos] = useState<SurgicalServiceOption[]>([])
  const [servicoId, setServicoId] = useState('')
  const [procedimento, setProcedimento] = useState('')
  const [asa, setAsa] = useState('')

  async function reload() {
    const res = await getHospitalizationAccount(hospitalizationId)
    if (!('error' in res)) setAccount(res)
    setLoading(false)
  }

  useEffect(() => { void reload() }, [hospitalizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cirurgiaAberta || servicos.length) return
    listSurgicalServices().then(r => { if (Array.isArray(r)) setServicos(r) })
  }, [cirurgiaAberta, servicos.length])

  async function handleSettle(method: 'pdv' | 'paid') {
    setBusy(true); setError(null); setAviso(null)
    const res = await settleHospitalizationAccount(hospitalizationId, method)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setAviso(method === 'pdv'
      ? `${fmtBRL(res.amount)} enviado ao caixa. A conta continua aberta: novos itens entram normalmente e vão ao caixa no próximo envio.`
      : `${fmtBRL(res.amount)} marcado como pago.`)
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

  async function handleDevolverAoMV() {
    if (!confirm('Devolver o pet para a fila do médico-veterinário? A internação é encerrada e a consulta volta como revisão pós-internação.')) return
    setBusy(true); setError(null)
    const res = await sendToVetReview(hospitalizationId, consultationId)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    onStatusChanged?.('revisao_pos_internacao')
  }

  function escolherServico(id: string) {
    setServicoId(id)
    const s = servicos.find(x => x.id === id)
    if (s) setProcedimento(s.name)
  }

  async function handleEnviarAoCirurgico() {
    setBusy(true); setError(null); setAviso(null)
    const res = await sendHospitalizationToSurgery(hospitalizationId, {
      procedure_name: procedimento, service_id: servicoId || null, asa_risk: asa || null,
    })
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setCirurgiaAberta(false); setProcedimento(''); setServicoId(''); setAsa('')
    setAviso('Pet encaminhado ao centro cirúrgico. Ao fim da cirurgia ele volta para esta internação, com os custos da cirurgia nesta conta.')
    await reload()
  }

  const balance  = account?.balance ?? 0
  const noCaixa  = account?.awaiting_cashier ?? 0
  const settled  = balance <= 0
  const isReadyForDischarge = status === 'ready_for_discharge'
  const encerrada = status === 'discharged'

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5" data-testid="conta-tab">
      {/* Saldo */}
      <div className={`rounded-2xl border-2 px-4 py-3 ${balance > 0 ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-70 flex items-center gap-1"><Receipt className="h-3 w-3" /> Em aberto na internação</p>
            <p className={`text-2xl font-bold tabular-nums ${balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{fmtBRL(balance)}</p>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            {noCaixa > 0 && (
              <p className="flex items-center justify-end gap-1 text-sky-700"><Clock className="h-3 w-3" /> No caixa, aguardando recebimento: <span className="font-semibold tabular-nums">{fmtBRL(noCaixa)}</span></p>
            )}
            <p>Já enviado/pago: <span className="font-semibold tabular-nums">{fmtBRL(account?.settled ?? 0)}</span></p>
            <p>Total: <span className="font-semibold tabular-nums">{fmtBRL(account?.total ?? 0)}</span></p>
          </div>
        </div>
        {balance > 0 && !encerrada && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => handleSettle('pdv')} disabled={busy}
              title="Leva ao caixa o que está em aberto agora. A conta continua aberta para novos itens; o próximo envio leva só o que entrar depois."
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Enviar ao caixa o que está em aberto
            </button>
            <button onClick={() => handleSettle('paid')} disabled={busy}
              title="Marca como pago sem passar pelo caixa (pagamento registrado por fora)"
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50">
              <CheckCircle2 className="h-3.5 w-3.5" /> Liquidar
            </button>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          O tutor pode pagar por etapas: envie ao caixa o que já foi lançado, continue lançando, e no fim só o que faltar vai ao caixa.
        </p>
      </div>

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      {aviso && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{aviso}</p>}

      {/* Lançamento manual (procedimentos/exames) */}
      {!encerrada && (
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
      )}

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

      {/* Encaminhamentos */}
      {!encerrada && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Encaminhar</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCirurgiaAberta(v => !v)} disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Syringe className="h-4 w-4" /> Centro Cirúrgico
            </button>
            <button onClick={handleDevolverAoMV} disabled={busy}
              title="Encerra a internação e devolve o pet para a fila do MV (revisão pós-internação)"
              className="flex items-center gap-2 rounded-xl border border-violet-300 bg-white hover:bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50">
              <Undo2 className="h-4 w-4" /> Devolver ao médico
            </button>
          </div>

          {cirurgiaAberta && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-3 space-y-2">
              <p className="text-xs text-slate-600">O pet vai para o Preparo do centro cirúrgico e, ao fim da cirurgia, volta para esta internação — os custos da cirurgia entram nesta conta.</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Serviço do catálogo</label>
                  <select value={servicoId} onChange={e => escolherServico(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">— escolher (opcional) —</option>
                    {servicos.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {servicoId && (() => {
                    const s = servicos.find(x => x.id === servicoId)
                    if (!s) return null
                    return (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {s.preop_checklist.length ? `${s.preop_checklist.length} checagem(ns) pré-operatória(s)` : 'sem checklist próprio'}
                        {s.default_kit_name ? ` · kit: ${s.default_kit_name}` : ''}
                      </p>
                    )
                  })()}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Risco ASA</label>
                  <select value={asa} onChange={e => setAsa(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">—</option>
                    {['I', 'II', 'III', 'IV', 'V'].map(a => <option key={a} value={a}>ASA {a}</option>)}
                  </select>
                </div>
              </div>
              <input value={procedimento} onChange={e => setProcedimento(e.target.value)} placeholder="Procedimento (ex.: Laparotomia exploratória)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={handleEnviarAoCirurgico} disabled={busy || !procedimento.trim()}
                  className="flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Syringe className="h-3.5 w-3.5" />} Iniciar preparo cirúrgico
                </button>
                <button onClick={() => setCirurgiaAberta(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Máquina de Estado de Alta */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Alta</h3>
        {!isReadyForDischarge ? (
          <>
            <p className="text-xs text-slate-500">A <strong>Alta Médica</strong> cessa diárias e aprazamento de medicações. O paciente permanece no Kanban até a Alta Administrativa.</p>
            <button onClick={handleMedicalDischarge} disabled={busy || encerrada}
              data-testid="btn-alta-medica"
              className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />} Dar Alta Médica
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Alta médica concedida. A <strong>Alta Administrativa</strong> encerra a internação e só é liberada com nada em aberto — envie ao caixa ou liquide o que falta.
            </p>
            <button
              onClick={handleAdministrativeDischarge}
              disabled={busy || !settled}
              data-testid="btn-alta-administrativa"
              title={settled ? 'Encerrar internação' : `Em aberto: ${fmtBRL(balance)} — envie ao caixa ou liquide`}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${
                settled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : settled ? <LogOut className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {settled ? 'Alta Administrativa' : `Em aberto: ${fmtBRL(balance)}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
