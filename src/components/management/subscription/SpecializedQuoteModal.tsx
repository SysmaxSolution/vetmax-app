'use client'

// Captura de lead do plano Especializado (R5/D4) — substitui o antigo link
// solto de WhatsApp por um registro rastreável no funil comercial da Sysmax.
// O cliente confirma a combinação montada no configurador e deixa o contato.

import { useState } from 'react'
import { BadgeCheck, Loader2, X } from 'lucide-react'
import { requestSpecializedQuote } from '@/lib/actions/subscription'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  moduleLabels: string[]
  moduleKeys: string[]
  estimate: number
  onCancel: () => void
  onSubmitted: () => void
  onError: (message: string) => void
}

export default function SpecializedQuoteModal({
  moduleLabels, moduleKeys, estimate, onCancel, onSubmitted, onError,
}: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    setSaving(true)
    const result = await requestSpecializedQuote({
      contactName: name,
      contactEmail: email,
      contactPhone: phone,
      desiredModuleKeys: moduleKeys,
      estimateMonthly: estimate,
      message,
    })
    setSaving(false)
    if ('error' in result) {
      onError(result.error)
      return
    }
    onSubmitted()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-violet-500" />
            <h3 className="text-base font-semibold text-slate-900">Falar com vendas — Especializado</h3>
          </div>
          <button onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Deixe seu contato e um consultor monta a proposta sob medida. O valor final
          é definido pela Sysmax — esta é uma estimativa pela tabela.
        </p>

        <div className="mt-3 rounded-lg bg-violet-50/70 border border-violet-100 px-3 py-2 text-sm">
          <p className="font-medium text-slate-700">
            {moduleLabels.length} módulo{moduleLabels.length === 1 ? '' : 's'} ·
            <span className="ml-1 font-bold text-violet-700 tabular-nums">{fmt(estimate)}/mês</span>
            <span className="text-[11px] font-normal text-slate-500"> (estimativa)</span>
          </p>
          {moduleLabels.length > 0 && (
            <p className="mt-0.5 text-[11px] text-slate-500">{moduleLabels.join(' · ')}</p>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            Nome para contato
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Responsável pela clínica"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600">
              E-mail
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                inputMode="email"
                placeholder="voce@clinica.com"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              WhatsApp / telefone
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="(16) 99999-9999"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-600">
            Mensagem (opcional)
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              placeholder="Conte o que sua operação precisa…"
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Solicitar proposta
          </button>
        </div>
      </div>
    </div>
  )
}
