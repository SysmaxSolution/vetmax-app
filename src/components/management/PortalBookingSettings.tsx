'use client'

import { useState } from 'react'
import { Smartphone, Loader2, Save } from 'lucide-react'
import { updateClinicConfig, getClinicConfig, type FlowConfig } from '@/lib/actions/clinic-settings'

type Mode = 'off' | 'reception' | 'direct'

const MODE_LABEL: Record<Mode, string> = {
  off:       'Desligado',
  reception: 'Recepção confirma',
  direct:    'Direto na agenda',
}
const MODE_HELP: Record<Mode, string> = {
  off:       'o tutor não agenda por este canal',
  reception: 'vira solicitação; a recepção confirma o horário e o veterinário',
  direct:    'o tutor escolhe um horário livre e já cai na agenda, sem confirmação',
}

interface Props {
  initialConfig?: { flow_config?: FlowConfig } | null
  onToast: (type: 'success' | 'error', msg: string) => void
}

export default function PortalBookingSettings({ initialConfig, onToast }: Props) {
  const fc = initialConfig?.flow_config
  const [portalEnabled, setPortalEnabled] = useState<boolean>(fc?.portal_enabled ?? false)
  const [portalMode,    setPortalMode]    = useState<Mode>((fc?.booking_mode_portal as Mode) ?? 'reception')
  const [whatsappMode,  setWhatsappMode]  = useState<Mode>((fc?.booking_mode_whatsapp as Mode) ?? 'reception')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    // Relê a config fresca para mesclar sem apagar outras flags do JSONB.
    const fresh = await getClinicConfig()
    const base: FlowConfig = ('error' in fresh ? (fc ?? { vet_merged_modules: [] }) : fresh.flow_config) as FlowConfig
    const res = await updateClinicConfig({
      flow_config: {
        ...base,
        portal_enabled:        portalEnabled,
        booking_mode_portal:   portalMode,
        booking_mode_whatsapp: whatsappMode,
      },
    })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Portal e agendamento configurados!')
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
          <Smartphone className="h-4 w-4 text-teal-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Portal do Tutor &amp; Agendamento Online</h3>
          <p className="text-xs text-slate-500">Controle o acesso do tutor e como ele pode agendar</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-5">
        {/* Portal ligado */}
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-slate-800">Usar o Portal do Tutor</p>
            <p className="text-xs text-slate-500">Libera a Área do Tutor (histórico, exames, vacinas e agendamento).</p>
          </div>
          <input type="checkbox" checked={portalEnabled} onChange={e => setPortalEnabled(e.target.checked)}
                 className="h-5 w-9 appearance-none rounded-full bg-slate-200 checked:bg-teal-500 relative transition-colors cursor-pointer
                            before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4" />
        </label>

        <div className={portalEnabled ? '' : 'opacity-50 pointer-events-none'}>
          <ModeSelect label="Agendamento pelo Portal" value={portalMode} onChange={setPortalMode} />
        </div>
        <ModeSelect label="Agendamento pelo WhatsApp (bot)" value={whatsappMode} onChange={setWhatsappMode} />

        <div className="flex justify-end">
          <button onClick={save} disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeSelect({ label, value, onChange }: { label: string; value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      <div className="grid grid-cols-3 gap-2">
        {(['off', 'reception', 'direct'] as Mode[]).map(m => (
          <button key={m} type="button" onClick={() => onChange(m)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    value === m ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-1">{MODE_HELP[value]}</p>
    </div>
  )
}
