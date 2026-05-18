'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, FileX, UserPlus, Play, Wrench, Sparkles, ArrowRight, PawPrint, Users } from 'lucide-react'
import { runMatchEngine, type ReviewBundle, type RemittanceLineRow } from '@/lib/actions/petlove-matching'
import { applyReconciliation, type ApplyReconciliationResult } from '@/lib/actions/petlove-reconciliation'
import type { ProcedureMappingRow } from '@/lib/actions/petlove-mapping'
import OrphanPetsBulkRegister from './OrphanPetsBulkRegister'
import ProcedureMappingModal from './ProcedureMappingModal'
import SuccessDialog, { type SuccessDialogSummary } from './SuccessDialog'

type Tab = 'matched' | 'partial' | 'orphan_invoice' | 'missing_patient_profile'

const TAB_ORDER: Tab[] = ['missing_patient_profile', 'orphan_invoice', 'partial', 'matched']

export default function ReviewDashboard({
  bundle,
  initialMappingRows,
}: {
  bundle: ReviewBundle
  initialMappingRows: ProcedureMappingRow[]
}) {
  const [activeTab, setActiveTab] = useState<Tab>('missing_patient_profile')
  const [isPending, startTransition] = useTransition()
  const [engineMsg, setEngineMsg] = useState<string | null>(null)
  const [data] = useState(bundle)
  const [mappingRows] = useState(initialMappingRows)
  const [mappingOpen, setMappingOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<ApplyReconciliationResult | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)

  const needsMatching = data.remittance.status === 'imported'
  const alreadyReconciled = data.remittance.status === 'reconciled'
  const unmappedCount = useMemo(
    () => mappingRows.filter(m => !m.mapping_id).length,
    [mappingRows],
  )

  const successSummary: SuccessDialogSummary = {
    remittance_number: data.remittance.remittance_number,
    total_value:       data.remittance.total_gross_value,
    matched_count:     data.counts.matched,
    partial_count:     data.counts.partial,
    new_pets_count:    data.counts.missing_patient_profile,
    applied:           applyResult,
  }

  function handleRunEngine() {
    setEngineMsg('Cruzando ' + data.remittance.lines_total + ' linhas com pets, consultas e invoice_items…')
    startTransition(async () => {
      const result = await runMatchEngine(data.remittance.id)
      if ('error' in result) {
        setEngineMsg('❌ ' + result.error)
      } else {
        setEngineMsg(`✅ ${result.updated} linhas processadas. Recarregando…`)
        window.location.reload()
      }
    })
  }

  async function handleApprove() {
    if (applying) return
    setApproveError(null)
    setApplying(true)
    try {
      const res = await applyReconciliation(data.remittance.id)
      if ('error' in res) {
        setApproveError(res.error)
        return
      }
      setApplyResult(res)
      setSuccessOpen(true)
    } finally {
      setApplying(false)
    }
  }

  // ─── Atalhos de teclado ───────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignora quando foco está em input/textarea (digitação) ou quando modais estão abertos
      const target = e.target as HTMLElement | null
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isTyping || mappingOpen || successOpen) return

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const idx = TAB_ORDER.indexOf(activeTab)
        const next = e.key === 'ArrowRight'
          ? (idx + 1) % TAB_ORDER.length
          : (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length
        setActiveTab(TAB_ORDER[next])
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (needsMatching) handleRunEngine()
        else handleApprove()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, needsMatching, mappingOpen, successOpen])

  return (
    <div className="space-y-6">
      {/* Cabeçalho da remessa */}
      <header className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Remessa Petlove</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">#{data.remittance.remittance_number}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {formatDate(data.remittance.period_start)} – {formatDate(data.remittance.period_end)}
            {' · '}
            {data.remittance.lines_total} procedimento{data.remittance.lines_total !== 1 ? 's' : ''}
            {data.remittance.referral_bonus_value > 0 && (
              <> · <span className="text-purple-700">+ {formatBRL(data.remittance.referral_bonus_value)} de indicação</span></>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Valor Total Bruto</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatBRL(data.remittance.total_gross_value)}</p>
        </div>
      </header>

      {/* CTA: Executar Matching */}
      {needsMatching && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 flex items-center gap-4">
          <Play className="h-8 w-8 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">Esta remessa ainda não foi cruzada</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Clique para o sistema procurar pets, consultas e procedimentos no banco da clínica.
            </p>
            {engineMsg && <p className="text-xs text-amber-600 mt-2">{engineMsg}</p>}
          </div>
          <button
            onClick={handleRunEngine}
            disabled={isPending}
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Executar Matching
            <kbd className="ml-1 text-[10px] bg-amber-700/30 px-1 py-0.5 rounded">⌘↵</kbd>
          </button>
        </div>
      )}

      {/* Painel de Pets — totalizadores POR PET (não por linha) */}
      {/* Aparece SEMPRE: independe de runMatchEngine — calculado direto da remessa vs. patients da clínica */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">{/* keepalive */}
          <div className="flex items-center gap-2 mb-3">
            <PawPrint className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Pets na remessa</h2>
            <span className="text-xs text-slate-400 ml-auto">distintos por chip ou nome+tutor</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <PetStatBox
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Já cadastrados"
              count={data.counts.unique_pets_known}
              tone="emerald"
            />
            <PetStatBox
              icon={<UserPlus className="h-4 w-4" />}
              label="A cadastrar"
              count={data.counts.unique_pets_to_register}
              tone="purple"
            />
            <PetStatBox
              icon={<Users className="h-4 w-4" />}
              label="Total distinto"
              count={data.counts.unique_pets_total}
              tone="slate"
            />
          </div>
        <p className="text-[11px] text-slate-400 mt-3">
          {data.remittance.lines_total} {data.remittance.lines_total === 1 ? 'linha de procedimento' : 'linhas de procedimento'} no total — alguns pets têm múltiplos atendimentos na mesma remessa.
        </p>
      </div>

      {/* Banner: Mapeamento Necessário */}
      {unmappedCount > 0 && !needsMatching && (
        <div className="rounded-2xl border border-purple-300 bg-gradient-to-r from-purple-50 to-fuchsia-50 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Wrench className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-purple-900">
              Mapeamento Necessário ({unmappedCount} {unmappedCount === 1 ? 'item' : 'itens'})
            </p>
            <p className="text-sm text-purple-700 mt-0.5">
              Vincule os nomes da Petlove aos serviços/produtos do seu estoque. O sistema aprende e usa nas próximas remessas.
            </p>
          </div>
          <button
            onClick={() => setMappingOpen(true)}
            className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Wrench className="h-4 w-4" />
            Mapear Agora
          </button>
        </div>
      )}

      {/* Cards de Diagnóstico (4 categorias) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DiagnosticCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="green"
          active={activeTab === 'matched'}
          onClick={() => setActiveTab('matched')}
          count={data.counts.matched}
          value={data.counts.matched_value}
          label="Casados"
        />
        <DiagnosticCard
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="amber"
          active={activeTab === 'partial'}
          onClick={() => setActiveTab('partial')}
          count={data.counts.partial}
          value={data.counts.partial_value}
          label="Divergências"
        />
        <DiagnosticCard
          icon={<FileX className="h-5 w-5" />}
          tone="rose"
          active={activeTab === 'orphan_invoice'}
          onClick={() => setActiveTab('orphan_invoice')}
          count={data.counts.orphan_invoice}
          value={data.counts.orphan_invoice_value}
          label="Sem Lançamento"
        />
        <DiagnosticCard
          icon={<UserPlus className="h-5 w-5" />}
          tone="purple"
          active={activeTab === 'missing_patient_profile'}
          onClick={() => setActiveTab('missing_patient_profile')}
          count={data.counts.unique_pets_to_register}
          value={data.counts.missing_patient_value}
          label="Novos Pets"
          sublabel={`${data.counts.missing_patient_profile} linha${data.counts.missing_patient_profile !== 1 ? 's' : ''}`}
        />
      </div>

      {/* Conteúdo da aba */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {activeTab === 'matched' && (
          <LineList
            heading="Atendimentos Casados"
            description="O sistema encontrou o pet, a consulta e o invoice_item com valor dentro da tolerância."
            lines={data.matched}
            emptyHint="Execute o matching para ver os casados."
            tone="green"
          />
        )}
        {activeTab === 'partial' && (
          <LineList
            heading="Cadastros Desatualizados / Divergências"
            description="Match parcial: cadastro do pet precisa ser atualizado ou houve drift de valor."
            lines={data.partial}
            emptyHint="Nenhuma divergência encontrada nesta remessa."
            tone="amber"
          />
        )}
        {activeTab === 'orphan_invoice' && (
          <LineList
            heading="Pendências para Revisão (Lançamentos Faltando)"
            description="A Petlove pagou, mas o procedimento não está lançado no SysVetMax."
            lines={data.orphan_invoice}
            emptyHint="Nenhuma pendência. Ótimo!"
            tone="rose"
          />
        )}
        {activeTab === 'missing_patient_profile' && (
          <OrphanPetsBulkRegister
            lines={data.missing_patient_profile}
            onComplete={() => window.location.reload()}
          />
        )}
      </section>

      {/* CTA Final: Aprovar Conciliação */}
      {!needsMatching && (
        <div className={`sticky bottom-4 z-10 rounded-2xl border shadow-lg p-4 flex items-center gap-4 ${
          alreadyReconciled
            ? 'border-slate-200 bg-slate-50'
            : 'border-emerald-300 bg-gradient-to-r from-emerald-50 to-purple-50'
        }`}>
          <Sparkles className={`h-6 w-6 flex-shrink-0 ${alreadyReconciled ? 'text-slate-400' : 'text-emerald-600'}`} />
          <div className="flex-1 min-w-0">
            {alreadyReconciled ? (
              <>
                <p className="font-semibold text-slate-700">Remessa já conciliada</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Os lançamentos estão em A Receber. Para refazer, estorne a conciliação.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-900">Pronto para aprovar?</p>
                <div className="text-xs text-slate-700 mt-1 space-y-0.5">
                  <p>
                    O sistema vai processar <strong>{data.remittance.lines_total}</strong> linhas
                    {data.counts.unique_pets_total > 0 && <> de <strong>{data.counts.unique_pets_total}</strong> pets</>}
                    {' '}totalizando{' '}
                    <strong className="text-emerald-700">{formatBRL(data.remittance.total_gross_value)}</strong>:
                  </p>
                  <ul className="ml-2 text-[11px] text-slate-600 space-y-0.5">
                    {data.counts.unique_pets_to_register > 0 && (
                      <li>• <strong>{data.counts.unique_pets_to_register}</strong> pet{data.counts.unique_pets_to_register !== 1 ? 's' : ''} novo{data.counts.unique_pets_to_register !== 1 ? 's' : ''} cadastrado{data.counts.unique_pets_to_register !== 1 ? 's' : ''} automaticamente (com tutor)</li>
                    )}
                    <li>• <strong>{data.counts.matched + data.counts.partial + data.counts.orphan_invoice + data.counts.missing_patient_profile}</strong> títulos individuais em A Receber (1 por procedimento)</li>
                    {data.counts.partial > 0 && (
                      <li>• <strong>{data.counts.partial}</strong> divergência{data.counts.partial !== 1 ? 's' : ''} de valor (ajuste de drift centavo a centavo)</li>
                    )}
                    {data.counts.orphan_invoice > 0 && (
                      <li>• <strong>{data.counts.orphan_invoice}</strong> lançamento{data.counts.orphan_invoice !== 1 ? 's' : ''} retroativo{data.counts.orphan_invoice !== 1 ? 's' : ''} (Petlove pagou e o sistema não tinha invoice)</li>
                    )}
                    <li>• <strong>~{data.remittance.lines_total}</strong> preços fixados nos perfis dos pets</li>
                    {data.remittance.referral_bonus_value > 0 && (
                      <li>• Bônus de indicação <strong>{formatBRL(data.remittance.referral_bonus_value)}</strong> como título avulso</li>
                    )}
                    <li>• Movimentações registradas no <strong>Extrato bancário</strong> da conta padrão</li>
                  </ul>
                </div>
                {approveError && (
                  <p className="text-xs text-rose-700 mt-1.5 font-medium">❌ {approveError}</p>
                )}
              </>
            )}
          </div>
          {!alreadyReconciled && (
            <button
              onClick={handleApprove}
              disabled={applying}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl transition-colors shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-wait"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {applying ? 'Processando…' : 'Aprovar Conciliação'}
              {!applying && <kbd className="ml-1 text-[10px] bg-emerald-700/30 px-1 py-0.5 rounded">⌘↵</kbd>}
            </button>
          )}
        </div>
      )}

      {/* Atalhos de teclado — dica visual */}
      <div className="text-[11px] text-slate-400 text-center">
        <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">←</kbd>
        <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded ml-1">→</kbd>
        <span className="ml-1.5">trocam abas</span>
        <span className="mx-2">·</span>
        <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Ctrl/⌘</kbd>
        <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded ml-1">Enter</kbd>
        <span className="ml-1.5">dispara ação principal</span>
      </div>

      {/* Modais */}
      <ProcedureMappingModal
        open={mappingOpen}
        remittanceId={data.remittance.id}
        initialRows={mappingRows}
        onClose={() => setMappingOpen(false)}
        onSaved={() => window.location.reload()}
      />
      <SuccessDialog
        open={successOpen}
        summary={successSummary}
        onClose={() => setSuccessOpen(false)}
      />
    </div>
  )
}

// ─── DiagnosticCard ───────────────────────────────────────────────────────────

const TONE_STYLES = {
  green:  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', muted: 'text-emerald-600', activeBorder: 'ring-emerald-400' },
  amber:  { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-900',   muted: 'text-amber-600',   activeBorder: 'ring-amber-400' },
  rose:   { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-900',    muted: 'text-rose-600',    activeBorder: 'ring-rose-400' },
  purple: { bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-900',  muted: 'text-purple-600',  activeBorder: 'ring-purple-400' },
} as const

// ─── PetStatBox ───────────────────────────────────────────────────────────────

const STAT_BOX_TONES = {
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  purple:  'bg-purple-50  border-purple-200  text-purple-900',
  slate:   'bg-slate-50   border-slate-200   text-slate-700',
} as const

function PetStatBox({
  icon, label, count, tone,
}: {
  icon: React.ReactNode
  label: string
  count: number
  tone: keyof typeof STAT_BOX_TONES
}) {
  return (
    <div className={`rounded-xl border p-3 ${STAT_BOX_TONES[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold opacity-70 uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold tabular-nums mt-1">{count}</p>
    </div>
  )
}

function DiagnosticCard({
  icon, tone, count, value, label, sublabel, active, onClick,
}: {
  icon: React.ReactNode
  tone: keyof typeof TONE_STYLES
  count: number
  value: number
  label: string
  sublabel?: string
  active: boolean
  onClick: () => void
}) {
  const s = TONE_STYLES[tone]
  return (
    <button
      onClick={onClick}
      className={`
        text-left p-4 rounded-2xl border ${s.bg} ${s.border} ${s.text}
        transition-all hover:shadow-md
        ${active ? `ring-2 ${s.activeBorder} shadow-md` : ''}
      `}
    >
      <div className={`flex items-center gap-2 ${s.muted} text-xs font-semibold uppercase tracking-wide`}>
        {icon}
        {label}
      </div>
      <p className="text-3xl font-bold mt-2 tabular-nums">{count}</p>
      <p className={`text-xs ${s.muted} mt-1 tabular-nums`}>
        {value > 0 ? formatBRL(value) : '—'}
        {sublabel && <span className="ml-1 opacity-70">· {sublabel}</span>}
      </p>
    </button>
  )
}

// ─── LineList ─────────────────────────────────────────────────────────────────

function LineList({
  heading, description, lines, emptyHint, tone,
}: {
  heading: string; description: string; lines: RemittanceLineRow[]; emptyHint: string; tone: keyof typeof TONE_STYLES
}) {
  const s = TONE_STYLES[tone]
  return (
    <>
      <header className={`px-5 py-4 border-b ${s.border} ${s.bg}`}>
        <h2 className={`font-semibold ${s.text}`}>{heading}</h2>
        <p className={`text-xs ${s.muted} mt-0.5`}>{description}</p>
      </header>
      {lines.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-slate-400">{emptyHint}</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {lines.map(l => (
            <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {l.procedure_name_raw ?? '(procedimento sem nome)'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {l.pet_name_raw ?? '?'} · {l.tutor_name_raw ?? '?'} · {formatDate(l.service_date)}
                  {l.plan_name_raw && <> · <span className="text-purple-600">{l.plan_name_raw}</span></>}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatBRL(Number(l.repass_value))}</p>
                {l.match_confidence != null && (
                  <p className="text-[10px] text-slate-400 tabular-nums">conf. {l.match_confidence}%</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
