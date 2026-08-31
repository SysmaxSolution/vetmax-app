'use client'

import { useState, useTransition } from 'react'
import { X, Save, Loader2, Building2, Trash2, RefreshCcw } from 'lucide-react'
import {
  upsertPartnerClinic, setPartnerClinicActive,
  type PartnerClinic, type PartnerClinicInput,
} from '@/lib/actions/partner-clinics'

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

interface Props {
  clinic?:     PartnerClinic
  priceTables: { id: string; name: string; slot: number }[]
  onClose:     () => void
  onSuccess:   (id: string) => void
}

export default function PartnerClinicFullModal({ clinic, priceTables, onClose, onSuccess }: Props) {
  const isEdit = !!clinic
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName]             = useState(clinic?.name ?? '')
  const [legalName, setLegalName]   = useState(clinic?.legal_name ?? '')
  const [cnpj, setCnpj]             = useState(clinic?.cnpj ?? '')
  const [crmv, setCrmv]             = useState(clinic?.crmv ?? '')
  const [contactName, setContact]   = useState(clinic?.contact_name ?? '')
  const [phone, setPhone]           = useState(clinic?.phone ?? '')
  const [email, setEmail]           = useState(clinic?.email ?? '')
  const [address, setAddress]       = useState(clinic?.address ?? '')
  const [priceTableId, setPriceTable] = useState(clinic?.price_table_id ?? '')
  const [commissionEnabled, setCommEnabled] = useState(clinic?.commission_enabled ?? false)
  const [commissionPercent, setCommPct]     = useState(
    clinic?.commission_percent != null ? String(clinic.commission_percent) : '',
  )
  const [notes, setNotes]           = useState(clinic?.notes ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (name.trim().length < 2) {
      setError('Nome deve ter ao menos 2 caracteres')
      return
    }
    if (commissionEnabled) {
      const pct = Number(commissionPercent)
      if (!commissionPercent.trim() || Number.isNaN(pct) || pct < 0 || pct > 100) {
        setError('Informe uma comissão válida (0 a 100%) para ativar o comissionamento')
        return
      }
    }

    const payload: PartnerClinicInput = {
      id:                 clinic?.id,
      name:               name.trim(),
      legal_name:         legalName.trim() || undefined,
      cnpj:               cnpj.replace(/\D/g, '') || undefined,
      crmv:               crmv.trim() || undefined,
      contact_name:       contactName.trim() || undefined,
      phone:              phone.replace(/\D/g, '') || undefined,
      email:              email.trim() || undefined,
      address:            address.trim() || undefined,
      price_table_id:     priceTableId || undefined,
      commission_enabled: commissionEnabled,
      commission_percent: commissionEnabled ? Number(commissionPercent) : undefined,
      notes:              notes.trim() || undefined,
    }

    startTransition(async () => {
      const res = await upsertPartnerClinic(payload)
      if ('error' in res) {
        setError(res.error)
        return
      }
      onSuccess(res.id)
    })
  }

  function handleToggleActive(active: boolean) {
    if (!clinic) return
    if (!active && !confirm(`Desativar a clínica parceira "${clinic.name}"?`)) return
    startTransition(async () => {
      const res = await setPartnerClinicActive(clinic.id, active)
      if ('error' in res) { setError(res.error); return }
      onSuccess(clinic.id)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-xl animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
              <Building2 className="h-5 w-5 text-indigo-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {isEdit ? 'Editar Clínica Parceira' : 'Nova Clínica Parceira'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEdit ? 'Atualize os dados e a tabela de preço da parceira' : 'Clínica que encaminha pacientes (B2B)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Nome + Razão Social */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nome fantasia <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Razão social</label>
              <input
                type="text"
                value={legalName}
                onChange={e => setLegalName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {/* CNPJ + CRMV */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">CNPJ</label>
              <input
                type="text"
                value={formatCnpj(cnpj)}
                onChange={e => setCnpj(e.target.value.replace(/\D/g, ''))}
                placeholder="00.000.000/0000-00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">CRMV (responsável)</label>
              <input
                type="text"
                value={crmv}
                onChange={e => setCrmv(e.target.value)}
                placeholder="CRMV-SP 00000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {/* Contato + Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Pessoa de contato</label>
              <input
                type="text"
                value={contactName}
                onChange={e => setContact(e.target.value)}
                placeholder="Nome do responsável"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Telefone</label>
              <input
                type="text"
                value={formatPhone(phone)}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="(00) 00000-0000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {/* Email + Endereço */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="contato@clinica.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Endereço</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Rua, número, bairro, cidade — UF"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {/* Tabela de preço da parceira */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tabela de preço desta parceira</label>
            <select
              value={priceTableId}
              onChange={e => setPriceTable(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white"
            >
              <option value="">— Usar a tabela padrão da clínica —</option>
              {priceTables.map(pt => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
            {priceTables.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                Nenhuma tabela de preço cadastrada ainda. Crie tabelas na aba Precificação.
              </p>
            )}
          </div>

          {/* Comissão / coparticipação (opcional) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={commissionEnabled}
                onChange={e => setCommEnabled(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Ativar comissão / coparticipação por serviço encaminhado
            </label>
            {commissionEnabled && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">Percentual de comissão (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={commissionPercent}
                  onChange={e => setCommPct(e.target.value)}
                  placeholder="Ex.: 10"
                  className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
                <p className="mt-1 text-xs text-slate-500">
                  O cálculo do repasse será feito no fechamento financeiro (Fase 1.5).
                </p>
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Condições comerciais, contato adicional, etc."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 flex-shrink-0 bg-slate-50">
          <div>
            {isEdit && clinic?.is_active && (
              <button
                type="button"
                onClick={() => handleToggleActive(false)}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Desativar
              </button>
            )}
            {isEdit && clinic && !clinic.is_active && (
              <button
                type="button"
                onClick={() => handleToggleActive(true)}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Reativar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={pending}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {pending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              {isEdit ? 'Salvar' : 'Cadastrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
