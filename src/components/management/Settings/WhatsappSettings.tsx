'use client'

import { useState } from 'react'
import { MessageCircle, Save, Loader2, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  saveWhatsAppSettings,
  type WhatsAppSettingsDisplay,
} from '@/lib/actions/whatsapp'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initial:  WhatsAppSettingsDisplay | null
  onToast:  (type: 'success' | 'error', message: string) => void
}

// ─── Masked field component ───────────────────────────────────────────────────

function MaskedField({
  label,
  masked,
  value,
  editing,
  onEdit,
  onChange,
  placeholder,
  required,
}: {
  label:       string
  masked:      string
  value:       string
  editing:     boolean
  onEdit:      () => void
  onChange:    (v: string) => void
  placeholder: string
  required?:   boolean
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {editing ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="w-full px-3 py-2 border border-amber-400 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-amber-50 font-mono"
        />
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-mono text-slate-600 select-none">
            {masked}
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
          >
            Alterar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WhatsappSettings({ initial, onToast }: Props) {
  // everSaved: true se já existe config no banco (atualiza após primeiro save)
  const [everSaved, setEverSaved] = useState(!!initial)

  const [provider,    setProvider]    = useState<'z-api' | 'sysmax' | 'evolution-api'>(initial?.providerName ?? 'z-api')
  const [apiUrl,      setApiUrl]      = useState(initial?.apiUrl ?? '')
  const [instanceId,  setInstanceId]  = useState('')
  const [token,       setToken]       = useState('')
  const [clientToken, setClientToken] = useState('')
  const [isActive,    setIsActive]    = useState(initial?.isActive ?? true)

  // Máscaras locais — iniciam com o valor do banco, atualizam após cada save
  // sem depender da prop `initial` (que é estática).
  const [instanceMasked, setInstanceMasked] = useState(initial?.instanceIdMasked  ?? null)
  const [tokenMasked,    setTokenMasked]    = useState(initial?.tokenMasked        ?? null)
  const [ctMasked,       setCtMasked]       = useState(initial?.clientTokenMasked  ?? null)

  // Controle de edição: começa em modo edição quando não há valor mascarado local.
  const [editInstance,    setEditInstance]    = useState(!instanceMasked)
  const [editToken,       setEditToken]       = useState(!tokenMasked)
  const [editClientToken, setEditClientToken] = useState(!ctMasked)

  const [saving, setSaving] = useState(false)

  function makeMask(value: string) {
    return `${value.slice(0, 4)}********`
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = await saveWhatsAppSettings({
      providerName:     provider,
      apiUrl:           (provider === 'sysmax' || provider === 'evolution-api') ? (apiUrl || null) : null,
      instanceId:       editInstance   ? instanceId   : '',
      token:            editToken      ? token        : '',
      clientToken:      editClientToken ? (clientToken || null) : null,
      isActive,
      keepInstanceId:   !editInstance,
      keepToken:        !editToken,
      keepClientToken:  !editClientToken,
    })

    setSaving(false)

    if ('error' in result) {
      onToast('error', result.error)
      return
    }

    onToast('success', 'Configurações de WhatsApp salvas com sucesso!')
    setEverSaved(true)

    // Atualiza máscaras locais com o que foi salvo agora
    if (editInstance   && instanceId)   setInstanceMasked(makeMask(instanceId))
    if (editToken      && token)        setTokenMasked(makeMask(token))
    if (editClientToken && clientToken) setCtMasked(makeMask(clientToken))

    // Volta ao modo mascarado
    setEditInstance(false)
    setEditToken(false)
    setEditClientToken(false)
    setInstanceId('')
    setToken('')
    setClientToken('')
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
          <MessageCircle className="h-4 w-4 text-green-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">Notificações WhatsApp</h2>
          <p className="text-xs text-slate-500">Configure o provedor de mensagens da clínica</p>
        </div>
        {/* Badge de status */}
        {everSaved && (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {isActive ? 'Ativo' : 'Inativo'}
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="p-6 space-y-5">
        {/* Aviso quando não há config */}
        {!everSaved && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-amber-50 border border-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Nenhuma configuração de WhatsApp encontrada. Os botões de envio de mensagem
              estão <strong>ocultos</strong> para todos os usuários até que uma configuração ativa seja salva.
            </p>
          </div>
        )}

        {/* Provedor */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
            Provedor <span className="text-red-500">*</span>
          </label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value as 'z-api' | 'sysmax')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
          >
            <option value="z-api">Z-API</option>
            <option value="evolution-api">Evolution API (self-hosted)</option>
            <option value="sysmax">Sysmax API</option>
          </select>
        </div>

        {/* URL da API — Sysmax e Evolution API */}
        {(provider === 'sysmax' || provider === 'evolution-api') && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              URL da API <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              placeholder={provider === 'evolution-api' ? 'http://localhost:8080' : 'https://api.sysmax.com.br/whatsapp'}
              required={provider === 'sysmax' || provider === 'evolution-api'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            {provider === 'evolution-api' && (
              <p className="text-xs text-slate-400 mt-1">
                URL do servidor Evolution API. Em produção, use a URL pública (ex: https://wpp.suaempresa.com.br).
              </p>
            )}
          </div>
        )}

        {/* ID da Instância */}
        {everSaved && !editInstance ? (
          <MaskedField
            label="ID da Instância"
            masked={instanceMasked ?? ''}
            value={instanceId}
            editing={false}
            onEdit={() => { setEditInstance(true); setInstanceId('') }}
            onChange={setInstanceId}
            placeholder="Ex: 3D22A1BC..."
            required
          />
        ) : (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              ID da Instância <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={instanceId}
              onChange={e => setInstanceId(e.target.value)}
              placeholder="Ex: 3D22A1BC..."
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
            />
          </div>
        )}

        {/* Token de Acesso */}
        {everSaved && !editToken ? (
          <MaskedField
            label={provider === 'evolution-api' ? 'API Key' : 'Token de Acesso'}
            masked={tokenMasked ?? ''}
            value={token}
            editing={false}
            onEdit={() => { setEditToken(true); setToken('') }}
            onChange={setToken}
            placeholder={provider === 'evolution-api' ? 'API Key configurada no container' : 'Token do Z-API ou chave da Sysmax API'}
            required
          />
        ) : (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              {provider === 'evolution-api' ? 'API Key' : 'Token de Acesso'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={provider === 'evolution-api' ? 'API Key configurada no container' : 'Token do Z-API ou chave da Sysmax API'}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
            />
          </div>
        )}

        {/* Client Token — exclusivo do Z-API */}
        {provider === 'z-api' && (
          everSaved && !editClientToken && ctMasked ? (
            <MaskedField
              label="Client Token"
              masked={ctMasked}
              value={clientToken}
              editing={false}
              onEdit={() => { setEditClientToken(true); setClientToken('') }}
              onChange={setClientToken}
              placeholder="Security Token do painel Z-API (opcional)"
            />
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                Client Token <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={clientToken}
                onChange={e => setClientToken(e.target.value)}
                placeholder="Security Token do painel Z-API (opcional)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
              />
            </div>
          )
        )}

        {/* Toggle Ativo/Inativo */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-sm font-semibold text-slate-700">Integração ativa</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Quando inativa, os botões de WhatsApp ficam ocultos no sistema
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsActive(v => !v)}
            className={`transition-colors ${isActive ? 'text-green-600' : 'text-slate-400'}`}
            title={isActive ? 'Clique para desativar' : 'Clique para ativar'}
          >
            {isActive
              ? <ToggleRight className="w-8 h-8" />
              : <ToggleLeft  className="w-8 h-8" />
            }
          </button>
        </div>

        {/* Submit */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              : <><Save className="w-4 h-4" /> Salvar Configurações</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}
