'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export interface RealtimeSyncOptions {
  /** Tabela do PostgreSQL para escutar */
  table:    string
  /** clinic_id para filtrar mensagens da própria clínica */
  clinicId: string
  /** Tipo de evento (padrão: '*' = todos) */
  event?:   RealtimeEvent
  /** Filtro adicional além do clinic_id (ex: 'id=eq.abc123') */
  extraFilter?: string
  /** Callback customizado. Se omitido, chama router.refresh() automaticamente. */
  onEvent?: (payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE'
    new:       Record<string, any>
    old:       Record<string, any>
  }) => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Escuta mudanças em tempo real no Supabase para uma tabela + clinic_id.
 *
 * Por padrão, chama router.refresh() quando um evento é recebido, o que
 * faz o Next.js re-executar os Server Components e atualizar os props passados
 * para os Client Components — sem recarregar a página inteira.
 *
 * Para comportamento customizado (ex: atualizar estado local diretamente),
 * forneça a prop `onEvent`.
 */
export function useRealtimeSync({
  table,
  clinicId,
  event = '*',
  extraFilter,
  onEvent,
}: RealtimeSyncOptions): void {
  const router = useRouter()

  useEffect(() => {
    if (!clinicId) return

    const supabase = createClient()

    // Filtro por clinic_id garante isolamento multi-tenant
    const filter = `clinic_id=eq.${clinicId}`

    const channel = supabase
      .channel(`vetmax:${table}:${clinicId}`)
      .on(
        // @ts-ignore — tipagem do supabase-js exige schema literal
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          filter,
        },
        (payload: any) => {
          if (onEvent) {
            onEvent({
              eventType: payload.eventType,
              new:       payload.new ?? {},
              old:       payload.old ?? {},
            })
          } else {
            router.refresh()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, clinicId, event])
}

// ─── Variante para escutar uma linha específica (sem filtro por clinic_id) ────

/**
 * Versão especializada: escuta mudanças em uma linha específica via `id`.
 * Usada em ConsultationDetail para detectar retorno de exames.
 */
export function useRealtimeRow(options: {
  table:    string
  rowId:    string
  event?:   RealtimeEvent
  onEvent:  (payload: { eventType: string; new: Record<string, any>; old: Record<string, any> }) => void
}): void {
  const { table, rowId, event = '*', onEvent } = options

  useEffect(() => {
    if (!rowId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`vetmax:${table}:row:${rowId}`)
      .on(
        // @ts-ignore
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          filter: `id=eq.${rowId}`,
        },
        (payload: any) => {
          onEvent({
            eventType: payload.eventType,
            new:       payload.new ?? {},
            old:       payload.old ?? {},
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, rowId, event])
}
