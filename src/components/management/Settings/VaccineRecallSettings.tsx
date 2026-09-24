'use client'

// Recall de vacina por WhatsApp — ativação E horário definidos pela clínica.
// Tarefa 0: antes ligar "Usar o Portal do Tutor" disparava junto uma campanha
// diária às 09:00 aos tutores, sem opt-in. Agora é uma rotina própria
// (flow_config.vaccine_recall_enabled, padrão DESLIGADO) com horário,
// antecedência e fuso configuráveis. O cron roda de hora em hora e atende só
// as clínicas cuja hora local configurada bate com a hora corrente.

import { useState } from 'react'
import { Syringe, ToggleLeft, ToggleRight, Save, Loader2, AlertTriangle } from 'lucide-react'
import { updateClinicConfig, getClinicConfig, type ClinicConfig, type FlowConfig } from '@/lib/actions/clinic-settings'
import { DEFAULT_RECALL_HOUR, DEFAULT_RECALL_DAYS, DEFAULT_RECALL_TZ } from '@/lib/vaccines/recall-schedule'

const TIME_ZONES = [
  ['America/Sao_Paulo', 'Brasília (GMT-3)'],
  ['America/Manaus', 'Manaus (GMT-4)'],
  ['America/Cuiaba', 'Cuiabá (GMT-4)'],
  ['America/Rio_Branco', 'Rio Branco (GMT-5)'],
  ['America/Belem', 'Belém (GMT-3)'],
  ['America/Fortaleza', 'Fortaleza (GMT-3)'],
] as const

export default function VaccineRecallSettings({ initialConfig, onToast }: {
  initialConfig: ClinicConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
}) {
  const flow = initialConfig?.flow_config as FlowConfig | undefined
  const [uses, setUses] = useState<boolean>(flow?.vaccine_recall_enabled === true)
  const [hour, setHour] = useState<number>(
    Number.isInteger(flow?.vaccine_recall_hour) ? (flow!.vaccine_recall_hour as number) : DEFAULT_RECALL_HOUR)
  const [days, setDays] = useState<number>(
    Number.isInteger(flow?.vaccine_recall_days) ? (flow!.vaccine_recall_days as number) : DEFAULT_RECALL_DAYS)
  const [tz, setTz] = useState<string>(flow?.vaccine_recall_tz ?? DEFAULT_RECALL_TZ)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const fresh = await getClinicConfig()
    const base: FlowConfig = (('error' in fresh) ? initialConfig?.flow_config : fresh.flow_config) ?? { vet_merged_modules: [] }
    const res = await updateClinicConfig({
      flow_config: {
        ...base,
        vaccine_recall_enabled: uses,
        vaccine_recall_hour: Math.min(23, Math.max(0, Math.trunc(hour) || 0)),
        vaccine_recall_days: Math.min(90, Math.max(1, Math.trunc(days) || DEFAULT_RECALL_DAYS)),
        vaccine_recall_tz: tz,
      },
    })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Recall de vacina configurado!')
  }

  const F = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none'
  const L = 'block text-xs font-medium text-slate-500 mb-1'

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
            <Syringe className="h-4 w-4 text-teal-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Aviso automático de vacina (recall)?</h3>
            <p className="text-xs text-slate-500">Mensagem de WhatsApp ao Tutor quando a próxima dose está chegando</p>
          </div>
        </div>
        <button
          onClick={() => setUses(v => !v)}
          className={`transition-colors ${uses ? 'text-teal-600' : 'text-slate-300'}`}
          title={uses ? 'Desativar recall de vacina' : 'Ativar recall de vacina'}
        >
          {uses ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
        </button>
      </div>

      <div className="px-6 py-4 space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-amber-800">
            <strong>Ligar isto ENVIA MENSAGENS DE WHATSAPP AOS TUTORES</strong>, automaticamente, todos os dias no
            horário escolhido, em nome da clínica. Certifique-se de que os tutores consentiram receber avisos
            (LGPD) — o envio em massa sem consentimento também aumenta o risco de bloqueio do número.
            Cada vacina é avisada uma única vez.
          </p>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${uses ? '' : 'opacity-50 pointer-events-none'}`}>
          <div>
            <label className={L}>Horário do envio</label>
            <select className={F} value={hour} onChange={e => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label className={L}>Antecedência (dias)</label>
            <input type="number" min={1} max={90} className={F} value={days}
                   onChange={e => setDays(Number(e.target.value))} />
          </div>
          <div>
            <label className={L}>Fuso horário</label>
            <select className={F} value={tz} onChange={e => setTz(e.target.value)}>
              {TIME_ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            {uses
              ? `Uma vez por dia, a partir das ${String(hour).padStart(2, '0')}:00, o sistema avisa por WhatsApp os tutores dos pets com vacina vencendo nos próximos ${days} dia(s). Cada vacina é avisada uma única vez.`
              : 'Quando desativado, nenhuma mensagem automática de vacina é enviada. Ligar o Portal do Tutor, sozinho, NÃO dispara esses avisos.'}
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
    </div>
  )
}
