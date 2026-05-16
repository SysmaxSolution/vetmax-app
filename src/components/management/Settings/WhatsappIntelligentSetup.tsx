'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Loader2, Wifi, WifiOff, RefreshCw, Bot, QrCode,
  CheckCircle2, AlertCircle, Save, ToggleLeft, ToggleRight, Megaphone,
} from 'lucide-react'
import { getBotConfig, saveBotConfig, type BotConfig } from '@/lib/actions/whatsapp-bot'
import { getDailyAlertTime, setDailyAlertTime } from '@/lib/actions/clinic-settings'
import WhatsappCampaignSettings from './WhatsappCampaignSettings'

interface Props {
  onToast: (type: 'success' | 'error', message: string) => void
}

type ConnectionState = 'not_created' | 'connecting' | 'open' | 'close' | 'error'

const POLL_INTERVAL_MS = 15_000

export default function WhatsappIntelligentSetup({ onToast }: Props) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('not_created')
  const [qrBase64, setQrBase64]               = useState<string | null>(null)
  const [instanceName, setInstanceName]        = useState<string | null>(null)
  const [connecting, setConnecting]            = useState(false)
  const [countdown, setCountdown]              = useState(POLL_INTERVAL_MS / 1000)
  const [loadingStatus, setLoadingStatus]      = useState(true)
  const [serviceDown, setServiceDown]          = useState(false)

  const pollTimer         = useRef<ReturnType<typeof setInterval> | null>(null)
  const countTimer        = useRef<ReturnType<typeof setInterval> | null>(null)
  const onToastRef        = useRef(onToast)
  const connectedToasted  = useRef(false)   // garante que o toast "conectado" dispara só 1x

  // Mantém onToastRef sempre atualizado sem re-executar effects
  onToastRef.current = onToast

  // ── Polling helpers ────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      if (!res.ok) return
      const data = await res.json()
      setConnectionState(data.state as ConnectionState)
      if (data.instanceName) setInstanceName(data.instanceName)
    } catch { /* silencia */ }
  }, [])

  const fetchQr = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/qrcode')
      if (res.status === 503) {
        setServiceDown(true)
        setQrBase64(null)
        return
      }
      setServiceDown(false)
      if (!res.ok) { setQrBase64(null); return }
      const data = await res.json()
      if (data.base64) setQrBase64(data.base64)
    } catch { setQrBase64(null) }
  }, [])

  const startPolling = useCallback(() => {
    if (pollTimer.current)  clearInterval(pollTimer.current)
    if (countTimer.current) clearInterval(countTimer.current)
    setCountdown(POLL_INTERVAL_MS / 1000)
    pollTimer.current = setInterval(async () => {
      await fetchStatus()
      await fetchQr()
      setCountdown(POLL_INTERVAL_MS / 1000)
    }, POLL_INTERVAL_MS)
    countTimer.current = setInterval(() => {
      setCountdown(prev => prev > 1 ? prev - 1 : POLL_INTERVAL_MS / 1000)
    }, 1000)
  }, [fetchStatus, fetchQr])

  const stopPolling = useCallback(() => {
    if (pollTimer.current)  { clearInterval(pollTimer.current);  pollTimer.current  = null }
    if (countTimer.current) { clearInterval(countTimer.current); countTimer.current = null }
  }, [])

  // ── Mount ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true
    async function init() {
      await fetchStatus()
      if (mounted) { await fetchQr(); setLoadingStatus(false); startPolling() }
    }
    init()
    return () => { mounted = false; stopPolling() }
  }, [fetchStatus, fetchQr, startPolling, stopPolling])

  // Para polling quando conectado — usa ref para evitar loop infinito de re-render
  useEffect(() => {
    if (connectionState !== 'open') return
    stopPolling()
    setQrBase64(null)
    if (!connectedToasted.current) {
      connectedToasted.current = true
      onToastRef.current('success', 'WhatsApp Inteligente conectado!')
    }
  }, [connectionState, stopPolling])

  // ── Conectar / Reconectar ──────────────────────────────────────────────────

  async function handleConnect() {
    setConnecting(true)
    setQrBase64(null)
    try {
      const res  = await fetch('/api/whatsapp/instance', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { onToast('error', data.error ?? 'Falha ao criar instância.'); setConnectionState('error'); return }
      setInstanceName(data.instanceName)
      setConnectionState('connecting')
      await fetchQr()
      startPolling()
    } catch {
      onToast('error', 'Erro de conexão com o servidor.')
      setConnectionState('error')
    } finally {
      setConnecting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 space-y-0 overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
          <Bot className="h-4 w-4 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">WhatsApp Inteligente (Bot IA)</h2>
          <p className="text-xs text-slate-500">Conecte o WhatsApp da clínica e configure o bot</p>
        </div>
        <StatusBadge state={connectionState} loading={loadingStatus} />
      </div>

      {/* Conteúdo */}
      {loadingStatus ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : connectionState === 'open' ? (
        <ConnectedSection instanceName={instanceName} onReconnect={handleConnect} connecting={connecting} onToast={onToast} />
      ) : (
        <div className="p-6">
          <DisconnectedView
            state={connectionState}
            qrBase64={qrBase64}
            instanceName={instanceName}
            countdown={countdown}
            connecting={connecting}
            serviceDown={serviceDown}
            onConnect={handleConnect}
          />
        </div>
      )}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ state, loading }: { state: ConnectionState; loading: boolean }) {
  if (loading) return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 flex items-center gap-1">
      <Loader2 className="w-3 h-3 animate-spin" /> Verificando
    </span>
  )
  if (state === 'open') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 flex items-center gap-1">
      <Wifi className="w-3 h-3" /> Conectado
    </span>
  )
  if (state === 'connecting') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 flex items-center gap-1">
      <Loader2 className="w-3 h-3 animate-spin" /> Aguardando scan
    </span>
  )
  if (state === 'not_created') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 flex items-center gap-1">
      <WifiOff className="w-3 h-3" /> Não configurado
    </span>
  )
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 flex items-center gap-1">
      <WifiOff className="w-3 h-3" /> Desconectado
    </span>
  )
}

// ─── Seção conectado (conexão + personalidade) ────────────────────────────────

function ConnectedSection({ instanceName, onReconnect, connecting, onToast }: {
  instanceName: string | null
  onReconnect:  () => void
  connecting:   boolean
  onToast:      (type: 'success' | 'error', message: string) => void
}) {
  const [activeTab, setActiveTab]       = useState<'bot' | 'campaigns'>('bot')
  const [alertTime, setAlertTime]       = useState('')
  const [savingAlert, setSavingAlert]   = useState(false)
  const [alertLoaded, setAlertLoaded]   = useState(false)

  useEffect(() => {
    getDailyAlertTime().then(res => {
      if (!('error' in res)) setAlertTime(res.alertTime ?? '')
      setAlertLoaded(true)
    })
  }, [])

  async function handleSaveAlertTime() {
    setSavingAlert(true)
    const res = await setDailyAlertTime(alertTime || null)
    setSavingAlert(false)
    onToast('error' in res ? 'error' : 'success',
      'error' in res ? res.error : 'Horário de disparo salvo!')
  }

  return (
    <div>
      {/* Status de conexão */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900">WhatsApp conectado!</p>
            {instanceName && <p className="text-xs text-emerald-700 mt-0.5 font-mono">Instância: {instanceName}</p>}
          </div>
          <button
            onClick={onReconnect}
            disabled={connecting}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} />
            Reconectar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-6 gap-1">
        <button
          onClick={() => setActiveTab('bot')}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'bot'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Bot className="w-4 h-4" />
          Bot
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'campaigns'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          Campanhas
        </button>
      </div>

      {activeTab === 'bot'
        ? <BotPersonalityForm onToast={onToast} />
        : <WhatsappCampaignSettings onToast={onToast} />}

      {/* Disparo Diário da Agenda */}
      {alertLoaded && (
        <div className="border-t border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">Disparo Diário da Agenda</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Cada profissional recebe no WhatsApp a lista de atendimentos do dia neste horário.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="time"
              value={alertTime}
              onChange={e => setAlertTime(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleSaveAlertTime}
              disabled={savingAlert}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {savingAlert ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingAlert ? 'Salvando...' : 'Salvar'}
            </button>
            {alertTime && (
              <button
                type="button"
                onClick={() => { setAlertTime(''); setDailyAlertTime(null) }}
                className="px-3 py-2 text-xs text-slate-500 hover:text-red-600 transition-colors"
              >
                Remover
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Formulário de personalidade ──────────────────────────────────────────────

function BotPersonalityForm({ onToast }: { onToast: (type: 'success' | 'error', message: string) => void }) {
  const [config, setConfig]   = useState<BotConfig>({
    personality_prompt:  null,
    can_book:            false,
    can_inform_prices:   true,
    working_hours_start: null,
    working_hours_end:   null,
    is_active:           false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    getBotConfig().then(data => {
      if (data) setConfig(data)
      setLoading(false)
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await saveBotConfig(config)
    setSaving(false)
    if ('error' in result) { onToast('error', result.error); return }
    onToast('success', 'Configurações do bot salvas!')
  }

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
    </div>
  )

  return (
    <form onSubmit={handleSave} className="px-6 py-5 space-y-5">
      <div className="flex items-center gap-3">
        <Bot className="h-5 w-5 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800">Configuração do Bot</h3>
      </div>

      {/* Bot ativo/inativo */}
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
        <div>
          <p className="text-sm font-semibold text-slate-700">Bot ativo</p>
          <p className="text-xs text-slate-500 mt-0.5">Quando inativo, mensagens recebidas não são respondidas automaticamente</p>
        </div>
        <button type="button" onClick={() => setConfig(c => ({ ...c, is_active: !c.is_active }))}
          className={config.is_active ? 'text-emerald-600' : 'text-slate-300'}>
          {config.is_active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
        </button>
      </div>

      {/* Personalidade */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">
          Personalidade / Instruções do Bot
        </label>
        <textarea
          rows={5}
          value={config.personality_prompt ?? ''}
          onChange={e => setConfig(c => ({ ...c, personality_prompt: e.target.value || null }))}
          placeholder={`Ex: Você é o assistente virtual da Clínica Vet ABC. Seja cordial e objetivo.\nResponda sobre: consultas, vacinas e banho & tosa.\nPara emergências, transfira para um atendente.`}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none font-mono text-xs"
        />
        <p className="text-xs text-slate-400 mt-1">
          Deixe em branco para usar o prompt padrão. As capacidades habilitadas abaixo controlam o que o bot pode fazer.
        </p>
      </div>

      {/* Capacidades */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500">Capacidades</p>
        <ToggleRow
          label="Informar preços"
          desc="Bot pode consultar e informar preços do catálogo"
          value={config.can_inform_prices}
          onChange={v => setConfig(c => ({ ...c, can_inform_prices: v }))}
        />
        <ToggleRow
          label="Agendar consultas"
          desc="Bot confirma agendamentos diretamente. Desativado: informa horários disponíveis e passa para um humano confirmar"
          value={config.can_book}
          onChange={v => setConfig(c => ({ ...c, can_book: v }))}
        />
      </div>

      {/* Horário de atendimento */}
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">Horário de atendimento do bot</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">Início</label>
            <input
              type="time"
              value={config.working_hours_start ?? ''}
              onChange={e => setConfig(c => ({ ...c, working_hours_start: e.target.value || null }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">Fim</label>
            <input
              type="time"
              value={config.working_hours_end ?? ''}
              onChange={e => setConfig(c => ({ ...c, working_hours_end: e.target.value || null }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Fora deste horário o bot envia uma mensagem automática de "fora do horário". Deixe em branco para responder sempre.
        </p>
      </div>

      {/* Salvar */}
      <div className="pt-1 border-t border-slate-100">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar configurações</>}
        </button>
      </div>
    </form>
  )
}

// ─── Helper de toggle ──────────────────────────────────────────────────────────

function ToggleRow({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <button type="button" onClick={() => onChange(!value)} className={value ? 'text-emerald-600' : 'text-slate-300'}>
        {value ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
      </button>
    </div>
  )
}

// ─── View desconectado ────────────────────────────────────────────────────────

function DisconnectedView({ state, qrBase64, instanceName, countdown, connecting, serviceDown, onConnect }: {
  state:        ConnectionState
  qrBase64:     string | null
  instanceName: string | null
  countdown:    number
  connecting:   boolean
  serviceDown:  boolean
  onConnect:    () => void
}) {
  const showQr = state === 'connecting' && qrBase64

  return (
    <div className="space-y-5">
      {serviceDown && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            <p className="font-semibold mb-0.5">Serviço WhatsApp temporariamente indisponível</p>
            <p>Tente novamente em alguns instantes ou entre em contato com o suporte.</p>
          </div>
        </div>
      )}

      {showQr ? (
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
            <img src={qrBase64!} alt="QR Code WhatsApp" className="w-52 h-52" />
          </div>
          <p className="text-xs text-slate-500">
            Atualizando em <span className="font-semibold text-slate-700">{countdown}s</span>
          </p>
        </div>
      ) : state === 'connecting' ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <QrCode className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">Carregando QR Code... ({countdown}s)</p>
        </div>
      ) : null}

      {state === 'connecting' && (
        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-700 mb-2">Como escanear:</p>
          {[
            'Abra o WhatsApp no celular da clínica',
            'Toque em Menu (⋮) → Dispositivos conectados',
            'Toque em "Conectar dispositivo"',
            'Aponte a câmera para o QR Code acima',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{i + 1}</span>
              <p className="text-xs text-slate-600">{step}</p>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onConnect}
        disabled={connecting}
        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
      >
        {connecting
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando instância...</>
          : state === 'connecting'
          ? <><RefreshCw className="w-4 h-4" /> Reconectar</>
          : <><Bot className="w-4 h-4" /> Conectar WhatsApp Inteligente</>}
      </button>
    </div>
  )
}
