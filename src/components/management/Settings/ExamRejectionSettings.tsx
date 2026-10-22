'use client'

// GESTÃO > CONFIGURAÇÕES — Fluxo de Rejeição de Exame.
// Toggle da flag clinics.flow_config.usa_fluxo_rejeicao_exame (padrão OFF) +
// catálogo de motivos de não realização, editável pela clínica. O catálogo só
// aparece depois que a flag é ligada e salva.

import { useState, useEffect, useCallback } from 'react'
import { ToggleLeft, ToggleRight, Save, Loader2, FlaskConical, Plus, Trash2, Pencil, X, RotateCcw } from 'lucide-react'
import type { ClinicConfig, FlowConfig } from '@/lib/actions/clinic-settings'
import { updateClinicConfig, getClinicConfig } from '@/lib/actions/clinic-settings'
import {
  listRejectionReasons, saveRejectionReason, deleteRejectionReason,
  seedDefaultRejectionReasons, type RejectionReason,
} from '@/lib/actions/exam-rejection'

interface Props {
  initialConfig: ClinicConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
}

export default function ExamRejectionSettings({ initialConfig, onToast }: Props) {
  const flowRaw = initialConfig?.flow_config as FlowConfig | undefined
  const [uses, setUses]     = useState<boolean>(flowRaw?.usa_fluxo_rejeicao_exame ?? false)
  const [saved, setSaved]   = useState<boolean>(flowRaw?.usa_fluxo_rejeicao_exame ?? false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    // Relê a config fresca para mesclar sem apagar outras flags do JSONB.
    const fresh = await getClinicConfig()
    const base: FlowConfig = (('error' in fresh) ? initialConfig?.flow_config : fresh.flow_config) ?? { vet_merged_modules: [] }
    const res = await updateClinicConfig({ flow_config: { ...base, usa_fluxo_rejeicao_exame: uses } })
    if ('error' in res) { setSaving(false); onToast('error', res.error); return }

    // Ao LIGAR, semeia os motivos comuns (idempotente) para a clínica já ter
    // com o que trabalhar até enviar a lista definitiva do laboratório.
    if (uses) {
      const seed = await seedDefaultRejectionReasons()
      if (!('error' in seed) && seed.inserted > 0) {
        onToast('success', `Fluxo ativado. ${seed.inserted} motivos padrão adicionados ao catálogo.`)
      } else {
        onToast('success', 'Fluxo de rejeição de exame ativado!')
      }
    } else {
      onToast('success', 'Fluxo de rejeição de exame desativado.')
    }
    setSaved(uses)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <FlaskConical className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Fluxo de exame não realizado?</h3>
              <p className="text-xs text-slate-500">Para laboratório de referência — exame não realizado não é cobrado</p>
            </div>
          </div>
          <button
            onClick={() => setUses(v => !v)}
            className={`transition-colors ${uses ? 'text-amber-600' : 'text-slate-300'}`}
            title={uses ? 'Desativar fluxo de rejeição' : 'Ativar fluxo de rejeição'}
          >
            {uses ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
          </button>
        </div>
        <div className="px-6 py-4 flex items-start justify-between gap-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            {uses
              ? 'O laboratório informa dentro do exame se ele foi realizado ou não realizado (com o motivo). O não realizado avisa automaticamente quem encaminhou — clínica parceira, protetor ou Médico Veterinário solicitante — e também o tutor, fica fora da cobrança e espera a decisão de recoletar ou não. O título financeiro do exame só é gerado quando o exame é realizado e liberado.'
              : 'Quando desativado, nada muda: o exame continua sendo cobrado no envio ao laboratório e nenhuma tela nova aparece.'}
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</> : <><Save className="h-3.5 w-3.5" /> Salvar</>}
          </button>
        </div>
      </div>

      {saved && <ReasonsCatalog onToast={onToast} />}
    </div>
  )
}

// ─── Catálogo de motivos ─────────────────────────────────────────────────────

function ReasonsCatalog({ onToast }: { onToast: (t: 'success' | 'error', m: string) => void }) {
  const [rows, setRows]       = useState<RejectionReason[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<RejectionReason | 'new' | null>(null)
  const [label, setLabel]     = useState('')
  const [desc, setDesc]       = useState('')
  const [busy, setBusy]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listRejectionReasons()
    setLoading(false)
    if ('error' in res) { onToast('error', res.error); return }
    setRows(res)
  }, [onToast])

  useEffect(() => { void load() }, [load])

  function openNew()  { setEditing('new'); setLabel(''); setDesc('') }
  function openEdit(r: RejectionReason) { setEditing(r); setLabel(r.label); setDesc(r.description ?? '') }
  function close()    { setEditing(null); setLabel(''); setDesc('') }

  async function save() {
    if (!label.trim()) { onToast('error', 'Informe o motivo.'); return }
    setBusy(true)
    const res = await saveRejectionReason({
      id: editing !== 'new' && editing ? editing.id : undefined,
      label: label.trim(), description: desc.trim() || null,
      sort_order: editing !== 'new' && editing ? editing.sort_order : rows.length * 10 + 1000,
    })
    setBusy(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Motivo salvo!')
    close()
    void load()
  }

  async function remove(r: RejectionReason) {
    setBusy(true)
    const res = await deleteRejectionReason(r.id)
    setBusy(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Motivo removido do catálogo.')
    void load()
  }

  async function restore() {
    setBusy(true)
    const res = await seedDefaultRejectionReasons()
    setBusy(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', res.inserted > 0 ? `${res.inserted} motivos padrão restaurados.` : 'O catálogo já tem todos os motivos padrão.')
    void load()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Motivos de não realização</h3>
          <p className="text-xs text-slate-500">O laboratório escolhe um destes ao marcar um exame como não realizado</p>
        </div>
        <div className="flex gap-2">
          <button onClick={restore} disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </button>
          <button onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
            <Plus className="h-3.5 w-3.5" /> Novo motivo
          </button>
        </div>
      </div>

      {editing && (
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {editing === 'new' ? 'Novo motivo' : 'Editar motivo'}
            </span>
            <button onClick={close} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <input
            value={label} onChange={e => setLabel(e.target.value)} autoFocus
            placeholder="Ex.: Amostra lipêmica"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)} rows={2}
            placeholder="Orientação enviada ao cliente (opcional). Ex.: jejum de 8 a 12 horas antes da nova coleta."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button onClick={save} disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar motivo
          </button>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {loading && <div className="px-6 py-6 text-center text-sm text-slate-400">Carregando…</div>}
        {!loading && rows.length === 0 && (
          <div className="px-6 py-6 text-center text-sm text-slate-500">
            Nenhum motivo cadastrado. Use “Restaurar padrão” para começar.
          </div>
        )}
        {rows.map(r => (
          <div key={r.id} className="flex items-start justify-between gap-4 px-6 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{r.label}</p>
              {r.description && <p className="mt-0.5 text-xs text-slate-500">{r.description}</p>}
            </div>
            <div className="flex flex-shrink-0 gap-1">
              <button onClick={() => openEdit(r)} title="Editar"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => remove(r)} title="Remover do catálogo" disabled={busy}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
