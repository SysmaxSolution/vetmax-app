'use client'

// Card genérico de ativação de rotina (clinics.flow_config).
// Tarefa 0: toda rotina nova tem flag PRÓPRIA e padrão DESLIGADO — ligar é ato
// explícito de configuração. Este componente concentra o boilerplate que antes
// era copiado em cada *Settings (ConveniosSettings, TreinamentoSettings…).

import { useState } from 'react'
import { ToggleLeft, ToggleRight, Save, Loader2, AlertTriangle } from 'lucide-react'
import { updateClinicConfig, getClinicConfig, type ClinicConfig, type FlowConfig } from '@/lib/actions/clinic-settings'

type FlagKey = keyof FlowConfig

interface Props {
  initialConfig: ClinicConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
  /** Chave booleana em flow_config. */
  flag: FlagKey
  title: string
  subtitle: string
  icon: React.ReactNode
  /** Texto exibido quando a rotina está LIGADA. */
  whenOn: string
  /** Texto exibido quando está DESLIGADA (explica o que ligar faz). */
  whenOff: string
  /** Aviso destacado (ex.: "ligar isto envia WhatsApp aos tutores"). */
  warning?: string
  /** Campos extras renderizados abaixo do texto (ex.: horário do recall). */
  extra?: (args: { enabled: boolean; patch: Partial<FlowConfig>; setPatch: (p: Partial<FlowConfig>) => void }) => React.ReactNode
  successMessage?: string
}

export default function FlowFlagCard({
  initialConfig, onToast, flag, title, subtitle, icon, whenOn, whenOff, warning, extra, successMessage,
}: Props) {
  const flowRaw = initialConfig?.flow_config as FlowConfig | undefined
  const [uses, setUses] = useState<boolean>(flowRaw?.[flag] === true)
  const [patch, setPatch] = useState<Partial<FlowConfig>>({})
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    // Relê a config fresca para mesclar sem apagar outras flags do JSONB.
    const fresh = await getClinicConfig()
    const base: FlowConfig = (('error' in fresh) ? initialConfig?.flow_config : fresh.flow_config) ?? { vet_merged_modules: [] }
    const res = await updateClinicConfig({ flow_config: { ...base, ...patch, [flag]: uses } as FlowConfig })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', successMessage ?? `${title} — configuração salva!`)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">{icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <button
          onClick={() => setUses(v => !v)}
          className={`transition-colors ${uses ? 'text-teal-600' : 'text-slate-300'}`}
          title={uses ? `Desativar: ${title}` : `Ativar: ${title}`}
        >
          {uses ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
        </button>
      </div>

      <div className="px-6 py-4 space-y-3">
        {warning && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-amber-800">{warning}</p>
          </div>
        )}
        {extra?.({ enabled: uses, patch, setPatch })}
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">{uses ? whenOn : whenOff}</p>
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
