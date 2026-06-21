'use client'

import { useEffect, useState } from 'react'
import { Loader2, BellRing, BellOff, Save } from 'lucide-react'
import { getTriggerModulesConfig, setTriggerModulesConfig } from '@/lib/actions/whatsapp'
import { TRIGGER_MODULE_LABELS } from '@/lib/whatsapp-triggers'

/**
 * M8 — liga/desliga os gatilhos automáticos de WhatsApp POR MÓDULO.
 * Ex.: a clínica quer enviar na internação mas não no consultório.
 */
export default function WhatsappTriggerModules({ onToast }: { onToast?: (m: string, t: 'success' | 'error') => void }) {
  const [disabled, setDisabled] = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    getTriggerModulesConfig().then(res => {
      setLoading(false)
      if (Array.isArray(res)) setDisabled(res)
    })
  }, [])

  const isOn = (key: string) => !disabled.includes(key)

  function toggle(key: string) {
    setDisabled(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function save() {
    setSaving(true)
    const res = await setTriggerModulesConfig(disabled)
    setSaving(false)
    if ('error' in res) onToast?.(res.error, 'error')
    else onToast?.('Gatilhos por módulo salvos.', 'success')
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-slate-400 py-4"><Loader2 className="h-4 w-4 animate-spin" /> Carregando gatilhos…</div>
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Gatilhos por módulo</h3>
        <p className="text-xs text-slate-500">Escolha em quais módulos as mensagens automáticas de WhatsApp são enviadas.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TRIGGER_MODULE_LABELS.map(m => {
          const on = isOn(m.key)
          return (
            <button key={m.key} type="button" onClick={() => toggle(m.key)}
              className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                on ? 'border-green-200 bg-green-50/60 text-green-800' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
              <span className="font-medium">{m.label}</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                {on ? <><BellRing className="h-3.5 w-3.5" /> Ativo</> : <><BellOff className="h-3.5 w-3.5" /> Desligado</>}
              </span>
            </button>
          )
        })}
      </div>

      <button type="button" onClick={save} disabled={saving}
        className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar gatilhos
      </button>
    </div>
  )
}
