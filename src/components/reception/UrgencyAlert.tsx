'use client'

import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { resolveUrgencyEscalation } from '@/lib/actions/surgery-mode'
import { createClient } from '@/lib/supabase/client'

interface UrgencyLog {
  id:              string
  tutor_name:      string | null
  tutor_phone:     string
  urgency_level:   'high' | 'critical'
  message_snippet: string | null
  notified_at:     string
}

function playAlertSound() {
  try {
    const ctx = new AudioContext()
    const notes = [880, 660, 880]
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      const t = ctx.currentTime + i * 0.28
      gain.gain.setValueAtTime(0.45, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      osc.start(t)
      osc.stop(t + 0.22)
    })
  } catch {
    // AudioContext indisponível (ex: sem interação prévia do usuário)
  }
}

export function UrgencyAlert({ clinicId }: { clinicId: string }) {
  const [alerts, setAlerts] = useState<UrgencyLog[]>([])
  const [resolving, setResolving] = useState<string | null>(null)

  // Busca alertas não resolvidos na montagem
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('urgency_escalation_logs')
      .select('id, tutor_name, tutor_phone, urgency_level, message_snippet, notified_at')
      .eq('clinic_id', clinicId)
      .is('resolved_at', null)
      .order('notified_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data?.length) setAlerts(data as UrgencyLog[])
      })
  }, [clinicId])

  const handleRealtimeEvent = useCallback((payload: { new: Record<string, unknown> }) => {
    const log = payload.new as unknown as UrgencyLog
    if (!log?.id) return
    setAlerts(prev => prev.some(a => a.id === log.id) ? prev : [log, ...prev])
    playAlertSound()
  }, [])

  useRealtimeSync({
    table:    'urgency_escalation_logs',
    clinicId,
    event:    'INSERT',
    onEvent:  handleRealtimeEvent,
  })

  async function handleResolve(id: string) {
    setResolving(id)
    await resolveUrgencyEscalation(id)
    setAlerts(prev => prev.filter(a => a.id !== id))
    setResolving(null)
  }

  if (!alerts.length) return null

  return (
    <div className="mb-4 space-y-2">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`flex items-start gap-3 rounded-lg border-2 p-3 ${
            alert.urgency_level === 'critical'
              ? 'border-red-500 bg-red-50 animate-pulse'
              : 'border-orange-400 bg-orange-50'
          }`}
        >
          <AlertTriangle
            className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
              alert.urgency_level === 'critical' ? 'text-red-600' : 'text-orange-500'
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">
              {alert.urgency_level === 'critical' ? '🚨 URGÊNCIA CRÍTICA' : '⚠️ URGÊNCIA ALTA'} — MV em Cirurgia
            </p>
            <p className="text-sm text-slate-700">
              <span className="font-medium">{alert.tutor_name ?? alert.tutor_phone}</span>
              {alert.message_snippet ? ` — ${alert.message_snippet}` : ''}
            </p>
          </div>
          <button
            onClick={() => handleResolve(alert.id)}
            disabled={resolving === alert.id}
            className="flex-shrink-0 rounded p-1 hover:bg-white/60 disabled:opacity-40"
            title="Marcar como resolvido"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      ))}
    </div>
  )
}
