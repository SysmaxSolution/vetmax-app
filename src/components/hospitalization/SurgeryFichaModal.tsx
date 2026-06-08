'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  X, Loader2, ChevronDown, ChevronRight, ClipboardCheck, HeartPulse, FileText,
  Mic, MicOff, Plus, Save, FileStack, Zap, Receipt, BedDouble, CheckCircle2, ShieldAlert,
} from 'lucide-react'
import { useClinicalVoiceAssistant } from '@/hooks/useClinicalVoiceAssistant'
import { useUnifiedVoiceDraft } from '@/hooks/useUnifiedClinicalVoice'
import VoiceReviewPanel from './VoiceReviewPanel'
import SurgeryStageFeed from './SurgeryStageFeed'
import ConsultationQuotationBadge from '@/components/billing/ConsultationQuotationBadge'
import { formatClinicTime } from '@/lib/time'
import {
  getSurgery, updateSurgeryChecklist, updateSurgeryReport,
  listSurgeryVitals, recordSurgeryVital, sendSurgeryToInternacao,
  type SurgeryDetail, type SurgeryChecklist, type SurgeryVital,
} from '@/lib/actions/surgeries'
import {
  listServiceKits, applyKitToSurgery, getSurgeryAccount,
  type ServiceKitSummary, type SurgeryAccount,
} from '@/lib/actions/surgery-kits'

/**
 * SurgeryFichaModal — ficha cirúrgica em ACORDEÃO VERTICAL (single-page, SEM abas).
 * O cirurgião rola e expande: Checklist Pré-Op → Ficha Anestésica → Relatório
 * (voz mãos-livres) → Kits & Fatura. Rodapé: Encaminhar para Internação (pós-op).
 */

interface Props {
  surgeryId: string
  onClose:   () => void
  onChanged: () => void
}

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

// ─── Seção do acordeão ─────────────────────────────────────────────────────────
function Section({ id, icon, title, subtitle, open, onToggle, children, accentClass = 'bg-slate-50 text-slate-600' }: {
  id: string; icon: React.ReactNode; title: string; subtitle?: string
  open: boolean; onToggle: () => void; children: React.ReactNode; accentClass?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button" onClick={onToggle} data-testid={`acc-${id}`}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${accentClass}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">{title}</p>
          {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-slate-50">{children}</div>}
    </div>
  )
}

export default function SurgeryFichaModal({ surgeryId, onClose, onChanged }: Props) {
  const [surgery, setSurgery] = useState<SurgeryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  // Acordeão: várias seções podem abrir; checklist começa aberta.
  const [openSet, setOpenSet] = useState<Set<string>>(new Set(['checklist']))
  const toggle = (id: string) => setOpenSet(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Checklist
  const [checklist, setChecklist] = useState<SurgeryChecklist>({})
  // Relatório
  const [report, setReport] = useState('')
  const [savingReport, setSavingReport] = useState(false)
  // Vitais
  const [vitals, setVitals] = useState<SurgeryVital[]>([])
  const [vForm, setVForm] = useState<Record<string, string>>({})
  const [savingVital, setSavingVital] = useState(false)
  // Kits & fatura
  const [kits, setKits] = useState<ServiceKitSummary[]>([])
  const [account, setAccount] = useState<SurgeryAccount | null>(null)
  const [busyKit, setBusyKit] = useState<string | null>(null)
  const [kitToast, setKitToast] = useState<string | null>(null)
  // Pós-op
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reloadAccount = useCallback(async () => {
    const a = await getSurgeryAccount(surgeryId)
    if (!('error' in a)) setAccount(a)
  }, [surgeryId])
  const reloadVitals = useCallback(async () => {
    const v = await listSurgeryVitals(surgeryId)
    if (Array.isArray(v)) setVitals(v)
  }, [surgeryId])

  useEffect(() => {
    let cancelled = false
    Promise.all([getSurgery(surgeryId), listServiceKits()]).then(([s, k]) => {
      if (cancelled) return
      if (!('error' in s)) { setSurgery(s); setChecklist(s.checklist ?? {}); setReport(s.surgical_report ?? '') }
      if (Array.isArray(k)) setKits(k)
      setLoading(false)
    })
    void reloadVitals(); void reloadAccount()
    return () => { cancelled = true }
  }, [surgeryId, reloadVitals, reloadAccount])

  // ── Voz unificada (extração multi-domínio: vitais/checklist/relatório) ──
  const uvoice = useUnifiedVoiceDraft('surgery')

  const reloadSurgery = useCallback(async () => {
    const s = await getSurgery(surgeryId)
    if (!('error' in s)) { setSurgery(s); setChecklist(s.checklist ?? {}); setReport(s.surgical_report ?? '') }
  }, [surgeryId])

  const handleVoiceSave = useCallback(async (text: string) => {
    if (!text.trim()) return
    const uni = await uvoice.ingest(text)
    if (uni) setOpenSet(prev => new Set(prev).add('report'))
  }, [uvoice])
  const voice = useClinicalVoiceAssistant({ onAutoSave: handleVoiceSave })
  const isRecording = voice.state === 'RECORDING'
  useEffect(() => { voice.activate(); return () => voice.deactivate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveChecklist(next: SurgeryChecklist) {
    setChecklist(next)
    await updateSurgeryChecklist(surgeryId, next)
  }

  async function saveReport() {
    setSavingReport(true)
    const res = await updateSurgeryReport(surgeryId, report)
    setSavingReport(false)
    if ('error' in res) setError(res.error)
  }

  async function handleRecordVital() {
    const num = (k: string) => { const r = (vForm[k] ?? '').trim().replace(',', '.'); if (!r) return null; const n = Number(r); return Number.isFinite(n) ? n : null }
    setSavingVital(true); setError(null)
    const res = await recordSurgeryVital(surgeryId, {
      temperature: num('temperature'), heart_rate: num('heart_rate'), resp_rate: num('resp_rate'),
      spo2: num('spo2'), blood_pressure: (vForm.blood_pressure ?? '').trim() || null,
    })
    setSavingVital(false)
    if ('error' in res) { setError(res.error); return }
    setVForm({}); await reloadVitals()
  }

  async function handleApplyKit(kitId: string) {
    setBusyKit(kitId); setError(null)
    const res = await applyKitToSurgery(kitId, surgeryId)
    setBusyKit(null)
    if ('error' in res) { setError(res.error); return }
    setKitToast(`Kit aplicado: ${fmtBRL(res.charged)} lançado · ${res.consumed} insumo(s) baixado(s)${res.reconciliation ? ` · ${res.reconciliation} p/ conciliação` : ''}.`)
    await reloadAccount()
    setTimeout(() => setKitToast(null), 4000)
  }

  async function handleSendToInternacao() {
    setSending(true); setError(null)
    const res = await sendSurgeryToInternacao(surgeryId, { status: 'observation' })
    setSending(false)
    if ('error' in res) { setError(res.error); return }
    onChanged()
    onClose()
  }

  const VITAL_FIELDS: { key: string; label: string; unit: string }[] = [
    { key: 'temperature', label: 'Temp', unit: '°C' }, { key: 'heart_rate', label: 'FC', unit: 'bpm' },
    { key: 'resp_rate', label: 'FR', unit: 'mpm' }, { key: 'spo2', label: 'SpO₂', unit: '%' },
  ]

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-red-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 flex-shrink-0"><FileText className="h-5 w-5 text-white" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 truncate">Ficha Cirúrgica{surgery ? ` · ${surgery.patient.name}` : ''}</h2>
                {surgery?.consultation_id && <ConsultationQuotationBadge consultationId={surgery.consultation_id} />}
              </div>
              <p className="text-[11px] text-slate-500 truncate">{surgery?.procedure_name ?? '—'}{surgery?.asa_risk ? ` · ASA ${surgery.asa_risk}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        {/* Acordeão (single-page, sem abas) */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="surgery-accordion">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : !surgery ? (
            <p className="text-center text-sm text-rose-600 py-8">Cirurgia não encontrada.</p>
          ) : (
            <>
              {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">{error}</div>}

              {/* Barra de voz — topo do acordeão (mãos livres) */}
              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 flex flex-col gap-1.5" data-testid="surgery-voice-bar">
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => voice.manualToggle()} data-testid="surgery-voice-btn"
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isRecording ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
                    {isRecording ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                    {isRecording ? 'Ouvindo… (diga "finalizar")' : 'Gravar por voz'}
                  </button>
                  <span className="text-[11px] text-slate-500">Ditado preenche <strong>Ficha Anestésica, Checklist e Relatório</strong> (revise abaixo).</span>
                </div>
                {isRecording && voice.transcript && <p className="text-[11px] text-violet-600 italic truncate">"{voice.transcript}"</p>}
                {uvoice.isProcessing && <p className="text-[11px] text-violet-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Estruturando ditado…</p>}
              </div>

              {/* Painel de revisão da voz (vitais anestésicos / checklist / relatório) */}
              {uvoice.hasDraft && (
                <VoiceReviewPanel
                  context="surgery"
                  surgeryId={surgeryId}
                  draft={uvoice.draft}
                  setDraft={uvoice.setDraft}
                  isRecording={isRecording}
                  isProcessing={uvoice.isProcessing}
                  transcript={voice.transcript}
                  hasDraft={uvoice.hasDraft}
                  lastSummary={uvoice.summary}
                  error={uvoice.error}
                  showMic={false}
                  onToggleMic={() => voice.manualToggle()}
                  clearDraft={uvoice.clear}
                  onPersisted={() => {
                    setKitToast('Ditado salvo: ficha atualizada.')
                    void reloadSurgery(); void reloadVitals()
                    setTimeout(() => setKitToast(null), 4000)
                  }}
                />
              )}

              {/* 1. Checklist Pré-Op */}
              <Section id="checklist" icon={<ClipboardCheck className="h-5 w-5" />} title="Checklist Pré-Operatório" subtitle="Jejum, exames, consentimento" open={openSet.has('checklist')} onToggle={() => toggle('checklist')} accentClass="bg-amber-50 text-amber-600">
                <div className="space-y-2 pt-2">
                  {([
                    ['fasting_confirmed', 'Jejum confirmado'],
                    ['preop_exams_ok',    'Exames pré-operatórios OK'],
                    ['consent_signed',    'Termo de consentimento assinado'],
                  ] as const).map(([key, label]) => {
                    const checked = !!checklist[key as keyof SurgeryChecklist]
                    return (
                      <label key={key} data-testid={`chk-${key}`} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50"
                        onClick={() => saveChecklist({ ...checklist, [key]: !checked })}>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
                          {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <span className={`text-sm ${checked ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>{label}</span>
                      </label>
                    )
                  })}
                  {!checklist.consent_signed && (
                    <p className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <ShieldAlert className="h-3.5 w-3.5" /> Termo de consentimento pendente — obrigatório antes do procedimento (CFMV).
                    </p>
                  )}
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Anotações cronológicas</p>
                    <SurgeryStageFeed surgeryId={surgeryId} stage="preop" locked={surgery?.status === 'done' || surgery?.status === 'canceled'} />
                  </div>
                </div>
              </Section>

              {/* 2. Ficha Anestésica */}
              <Section id="anesthesia" icon={<HeartPulse className="h-5 w-5" />} title="Ficha Anestésica" subtitle="Sinais vitais transoperatórios" open={openSet.has('anesthesia')} onToggle={() => toggle('anesthesia')} accentClass="bg-rose-50 text-rose-600">
                <div className="pt-2 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {VITAL_FIELDS.map(f => (
                      <label key={f.key} className="block">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{f.label} <span className="font-normal text-slate-400">{f.unit}</span></span>
                        <input type="number" inputMode="decimal" step="0.1" value={vForm[f.key] ?? ''} onChange={e => setVForm(p => ({ ...p, [f.key]: e.target.value }))}
                          className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-rose-500 focus:outline-none" />
                      </label>
                    ))}
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">PA</span>
                      <input value={vForm.blood_pressure ?? ''} onChange={e => setVForm(p => ({ ...p, blood_pressure: e.target.value }))} placeholder="120/80"
                        className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-rose-500 focus:outline-none" />
                    </label>
                  </div>
                  <button onClick={handleRecordVital} disabled={savingVital} className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {savingVital ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Registrar Aferição
                  </button>
                  {vitals.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {vitals.map(v => (
                        <div key={v.id} className="flex flex-wrap gap-x-3 text-[11px] text-slate-600 border border-slate-100 rounded-lg px-2.5 py-1.5">
                          <span className="text-slate-400">{formatClinicTime(v.recorded_at)}</span>
                          {v.temperature != null && <span>T {v.temperature}°C</span>}{v.heart_rate != null && <span>FC {v.heart_rate}</span>}
                          {v.resp_rate != null && <span>FR {v.resp_rate}</span>}{v.spo2 != null && <span>SpO₂ {v.spo2}%</span>}{v.blood_pressure && <span>PA {v.blood_pressure}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Anotações cronológicas</p>
                    <SurgeryStageFeed surgeryId={surgeryId} stage="anesthesia" locked={surgery?.status === 'done' || surgery?.status === 'canceled'} />
                  </div>
                </div>
              </Section>

              {/* 3. Relatório Cirúrgico (voz mãos-livres) */}
              <Section id="report" icon={<FileText className="h-5 w-5" />} title="Relatório Cirúrgico" subtitle="Ditado por voz (mãos livres) ou texto" open={openSet.has('report')} onToggle={() => toggle('report')} accentClass="bg-violet-50 text-violet-600">
                <div className="pt-2 space-y-2">
                  <textarea value={report} onChange={e => setReport(e.target.value)} rows={6} placeholder="Descrição da técnica cirúrgica, achados, intercorrências…"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none resize-y" />
                  <button onClick={saveReport} disabled={savingReport} className="flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {savingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar Relatório
                  </button>
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Anotações cronológicas</p>
                    <SurgeryStageFeed surgeryId={surgeryId} stage="report" locked={surgery?.status === 'done' || surgery?.status === 'canceled'} />
                  </div>
                </div>
              </Section>

              {/* 4. Kits & Fatura */}
              <Section id="kits" icon={<FileStack className="h-5 w-5" />} title="Kits Cirúrgicos & Fatura" subtitle={account ? `Total: ${fmtBRL(account.total)}` : 'Insumos e faturamento'} open={openSet.has('kits')} onToggle={() => toggle('kits')} accentClass="bg-indigo-50 text-indigo-600">
                <div className="pt-2 space-y-3">
                  {kitToast && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">{kitToast}</div>}
                  {kits.length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhum kit cadastrado. Cadastre kits no catálogo para aplicar com 1 clique.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {kits.map(k => (
                        <div key={k.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                          <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{k.name}</p><p className="text-[11px] text-slate-500">{k.item_count} insumo(s)</p></div>
                          <button onClick={() => handleApplyKit(k.id)} disabled={busyKit !== null} data-testid="surgery-kit-apply"
                            className="flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                            {busyKit === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Aplicar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {account && account.charges.length > 0 && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><Receipt className="h-3 w-3" /> Fatura</p>
                      {account.charges.map(c => (
                        <div key={c.id} className="flex justify-between text-xs"><span className="text-slate-600 truncate">{c.description}</span><span className="font-bold tabular-nums">{fmtBRL(c.amount)}</span></div>
                      ))}
                      <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-1 mt-1"><span>Total</span><span className="tabular-nums">{fmtBRL(account.total)}</span></div>
                    </div>
                  )}
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Footer — Transição Pós-Op */}
        {surgery && (
          <div className="flex-shrink-0 flex items-center gap-2 px-5 py-3 border-t border-slate-100">
            <button onClick={handleSendToInternacao} disabled={sending} data-testid="surgery-to-internacao-btn"
              className="flex items-center gap-2 rounded-xl bg-pink-600 hover:bg-pink-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedDouble className="h-4 w-4" />} Encaminhar para Internação
            </button>
            <button onClick={onClose} className="ml-auto rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}
