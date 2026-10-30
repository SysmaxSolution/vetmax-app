'use client'

// GESTÃO › CONFIGURAÇÕES — gate do pré-anestésico (Fase 4 · item 4.2).
//
// Não é um toggle só: cada exigência trava ou apenas avisa, porque essa decisão
// é da clínica e varia (jejum é mandatório em quase todo lugar; exame
// pré-operatório depende do protocolo). O `FlowFlagCard` padrão não serve aqui —
// a flag é uma LISTA, não um booleano.
//
// Padrão: nada trava. Ligar é ato explícito de configuração.

import { useState } from 'react'
import { ShieldAlert, Save, Loader2, Check } from 'lucide-react'
import { updateClinicConfig, getClinicConfig } from '@/lib/actions/clinic-settings'
import type { ClinicConfig, FlowConfig } from '@/types/clinic-settings'
import { ROTULO_EXIGENCIA } from '@/lib/surgery/gate-preanestesico'
import type { ExigenciaPreAnestesica } from '@/lib/surgery/gate-preanestesico'

const EXIGENCIAS: ExigenciaPreAnestesica[] = ['jejum', 'exames_preop', 'consentimento', 'asa']

const EXPLICACAO: Record<ExigenciaPreAnestesica, string> = {
  jejum:         'O jejum foi confirmado com o responsável e registrado na ficha.',
  exames_preop:  'Alguém conferiu os exames pré-operatórios daquele animal.',
  consentimento: 'O termo de consentimento está assinado pelo responsável.',
  asa:           'O risco anestésico (ASA I a V) foi classificado.',
}

interface Props {
  initialConfig: ClinicConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
}

export default function GatePreAnestesicoSettings({ initialConfig, onToast }: Props) {
  const inicial = ((initialConfig?.flow_config as FlowConfig | undefined)?.gate_pre_anestesico ?? []) as ExigenciaPreAnestesica[]
  const [trava, setTrava]   = useState<ExigenciaPreAnestesica[]>(inicial)
  const [saving, setSaving] = useState(false)

  function alternar(e: ExigenciaPreAnestesica) {
    setTrava(atual => atual.includes(e) ? atual.filter(x => x !== e) : [...atual, e])
  }

  async function salvar() {
    setSaving(true)
    // Relê a config fresca para mesclar sem apagar as outras flags do JSONB.
    const fresh = await getClinicConfig()
    const base: FlowConfig = (('error' in fresh) ? initialConfig?.flow_config : fresh.flow_config) ?? { vet_merged_modules: [] }
    const res = await updateClinicConfig({ flow_config: { ...base, gate_pre_anestesico: trava } })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', trava.length === 0
      ? 'Nenhuma exigência trava a cirurgia — tudo fica como aviso.'
      : `${trava.length} exigência(s) passam a impedir a ida para a sala.`)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
          <ShieldAlert className="h-4 w-4 text-teal-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-900">O que impede a cirurgia de ir para a sala?</h3>
          <p className="text-xs text-slate-500">Pré-anestésico — marque o que é obrigatório nesta clínica</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-2">
        {EXIGENCIAS.map(e => {
          const marcado = trava.includes(e)
          return (
            <label key={e} className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={marcado}
                onChange={() => alternar(e)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30"
              />
              <span className="min-w-0">
                <span className="text-sm text-slate-800 group-hover:text-slate-900">{ROTULO_EXIGENCIA[e]}</span>
                <span className={`ml-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                  marcado
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {marcado ? 'impede' : 'só avisa'}
                </span>
                <span className="block text-[11px] text-slate-400">{EXPLICACAO[e]}</span>
              </span>
            </label>
          )
        })}
      </div>

      <div className="px-6 py-4 border-t border-slate-100 flex items-start justify-between gap-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          {trava.length === 0
            ? 'Nada marcado: o sistema continua apenas mostrando o que falta, sem barrar ninguém — é o comportamento atual.'
            : 'O que está marcado impede a ida para a sala. Urgência continua possível: o Médico Veterinário libera com motivo, e a liberação fica registrada com o nome dele e aparece no mapa do dia.'}
        </p>
        <button
          onClick={salvar}
          disabled={saving}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </button>
      </div>
    </div>
  )
}
