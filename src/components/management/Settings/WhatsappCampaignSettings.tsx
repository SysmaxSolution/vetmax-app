'use client'

import { useState, useEffect, useTransition } from 'react'
import { ToggleLeft, ToggleRight, Save, Loader2, Clock, History } from 'lucide-react'
import {
  getCampaigns,
  saveCampaign,
  getCampaignLogs,
  type Campaign,
  type TriggerType,
  type CampaignLog,
} from '@/lib/actions/whatsapp-campaigns'

// ─── Campaign type definitions ────────────────────────────────────────────────

const CAMPAIGN_DEFS: {
  type:         TriggerType
  label:        string
  description:  string
  showDays:     boolean
  daysLabel:    string
  defaultDays:  number
}[] = [
  {
    type:        'no_visit',
    label:       'Reativação de Tutores Inativos',
    description: 'Envia mensagem para tutores sem consulta ou tosa há mais de X dias.',
    showDays:    true,
    daysLabel:   'Dias sem visita',
    defaultDays: 30,
  },
  {
    type:        'vaccine_due',
    label:       'Lembrete de Vacina',
    description: 'Avisa tutores sobre vacinas vencendo em breve.',
    showDays:    true,
    daysLabel:   'Antecedência (dias)',
    defaultDays: 15,
  },
  {
    type:        'pending_return',
    label:       'Retorno Pendente',
    description: 'Lembra tutores de retornos agendados que não foram realizados.',
    showDays:    true,
    daysLabel:   'Dias em atraso',
    defaultDays: 7,
  },
  {
    type:        'grooming_due',
    label:       'Banho e Tosa',
    description: 'Lembra tutores cujo pet não faz banho/tosa há mais de X dias.',
    showDays:    true,
    daysLabel:   'Dias sem banho/tosa',
    defaultDays: 45,
  },
]

const TRIGGER_LABELS: Record<string, string> = {
  no_visit:       'Reativação',
  vaccine_due:    'Vacina',
  pending_return: 'Retorno',
  grooming_due:   'Tosa',
}

function timeLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60)  return `há ${mins}min`
  if (mins < 1440) return `há ${Math.floor(mins / 60)}h`
  return `há ${Math.floor(mins / 1440)}d`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WhatsappCampaignSettings({
  onToast,
}: {
  onToast: (type: 'success' | 'error', message: string) => void
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [logs,      setLogs]      = useState<CampaignLog[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([getCampaigns(), getCampaignLogs(10)]).then(([c, l]) => {
      setCampaigns(c)
      setLogs(l)
      setLoading(false)
    })
  }, [])

  function updateCampaign(type: TriggerType, patch: Partial<Campaign>) {
    setCampaigns(prev => {
      const existing = prev.find(c => c.trigger_type === type)
      if (existing) {
        return prev.map(c => c.trigger_type === type ? { ...c, ...patch } : c)
      }
      const def = CAMPAIGN_DEFS.find(d => d.type === type)!
      return [...prev, { trigger_type: type, days_threshold: def.defaultDays, is_active: false, send_hour: 9, ...patch }]
    })
  }

  function getState(type: TriggerType): Campaign {
    const def  = CAMPAIGN_DEFS.find(d => d.type === type)!
    return campaigns.find(c => c.trigger_type === type) ?? {
      trigger_type:   type,
      days_threshold: def.defaultDays,
      is_active:      false,
      send_hour:      9,
    }
  }

  async function handleSave(type: TriggerType) {
    const state = getState(type)
    const res   = await saveCampaign(state)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Campanha salva!')
    const updated = await getCampaigns()
    setCampaigns(updated)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
    </div>
  )

  return (
    <div className="px-6 py-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Campanhas de Reativação</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          O sistema envia mensagens automáticas via WhatsApp no horário configurado.
        </p>
      </div>

      {/* Campaign cards */}
      <div className="space-y-3">
        {CAMPAIGN_DEFS.map(def => (
          <CampaignCard
            key={def.type}
            def={def}
            state={getState(def.type)}
            onChange={patch => updateCampaign(def.type, patch)}
            onSave={() => handleSave(def.type)}
          />
        ))}
      </div>

      {/* Recent logs */}
      {logs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <History className="h-4 w-4 text-slate-400" />
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Últimos disparos</h4>
          </div>
          <div className="space-y-1">
            {logs.map(log => (
              <div key={log.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">{log.tutor_name ?? '—'}</span>
                  {log.trigger_type && (
                    <span className="bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                      {TRIGGER_LABELS[log.trigger_type] ?? log.trigger_type}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  {log.response_received && (
                    <span className="text-emerald-600 font-semibold">respondeu</span>
                  )}
                  <span>{timeLabel(log.sent_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({
  def, state, onChange, onSave,
}: {
  def:      typeof CAMPAIGN_DEFS[0]
  state:    Campaign
  onChange: (patch: Partial<Campaign>) => void
  onSave:   () => Promise<void>
}) {
  const [saving, startSave] = useTransition()

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      state.is_active ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{def.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{def.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ is_active: !state.is_active })}
          className={state.is_active ? 'text-emerald-600 flex-shrink-0' : 'text-slate-300 flex-shrink-0'}
        >
          {state.is_active
            ? <ToggleRight className="w-8 h-8" />
            : <ToggleLeft  className="w-8 h-8" />}
        </button>
      </div>

      {/* Config row */}
      <div className="flex items-center gap-3 flex-wrap">
        {def.showDays && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-medium w-28 flex-shrink-0">{def.daysLabel}:</span>
            <input
              type="number"
              min={1}
              max={365}
              value={state.days_threshold}
              onChange={e => onChange({ days_threshold: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 text-center"
            />
          </label>
        )}

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="font-medium">Horário (UTC):</span>
          <select
            value={state.send_hour}
            onChange={e => onChange({ send_hour: parseInt(e.target.value) })}
            className="px-2 py-1 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </label>

        <button
          onClick={() => startSave(onSave)}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors ml-auto"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar
        </button>
      </div>
    </div>
  )
}
