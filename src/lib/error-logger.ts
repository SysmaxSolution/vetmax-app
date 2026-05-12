import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export type ErrorSource   = 'client' | 'server' | 'api' | 'edge' | 'vercel'
export type ErrorPriority = 'P0' | 'P1' | 'P2'

export interface ServerErrorOptions {
  /** Caminho da rota ou módulo onde o erro ocorreu */
  path: string
  /** Objeto de erro capturado no catch */
  error: unknown
  /** Origem do erro (default: 'server') */
  source?: ErrorSource
  /** Módulo funcional da clínica (ex: 'vet', 'triage', 'cashier') */
  module?: string
  /** clinic_id quando disponível no contexto de execução */
  clinicId?: string | null
  /** user_id quando disponível */
  userId?: string | null
  /** Stack trace manual, se diferente do error.stack */
  stackTrace?: string
  /** Trilha de navegação do usuário (apenas paths/IDs, sem dados pessoais) */
  userJourney?: { path: string; timestamp: string }[]
  /** Prioridade pré-classificada (ex: vinda do classifier de IA) */
  priority?: ErrorPriority
}

export interface LogResult {
  /** true = registro novo inserido; false = duplicata, occurrence_count incrementado */
  isNew: boolean
  /** ID do registro em error_logs (null se falhou a persistência) */
  id: string | null
  /** Contagem total de ocorrências após o upsert */
  occurrenceCount: number
}

/** Hash SHA-256 truncado em 20 chars — exportado para reuso no webhook */
export function computeFingerprint(path: string, message: string): string {
  return createHash('sha256')
    .update(`${path.slice(0, 200)}:${message.slice(0, 500)}`)
    .digest('hex')
    .slice(0, 20)
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try { return JSON.stringify(error) } catch { return 'Unknown error' }
}

function extractStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) return error.stack.slice(0, 4000)
  return undefined
}

/**
 * Registra um erro server-side no banco de dados.
 * Usa service_role (admin client) — funciona sem contexto de sessão.
 * Deduplica por fingerprint: incrementa occurrence_count em vez de inserir duplicatas.
 * Nunca lança exceção — falha silenciosamente para não derrubar a requisição original.
 * Retorna LogResult com informação se foi novo ou duplicata.
 */
export async function logServerError(opts: ServerErrorOptions): Promise<LogResult> {
  const failed: LogResult = { isNew: false, id: null, occurrenceCount: 0 }

  try {
    const message     = extractMessage(opts.error)
    const stack       = opts.stackTrace ?? extractStack(opts.error)
    const fingerprint = computeFingerprint(opts.path, message)
    const admin       = createAdminClient()

    // Dedup: se mesmo fingerprint+clinic já existe e não está resolvido, só incrementa
    const dedupQuery = admin
      .from('error_logs')
      .select('id, occurrence_count')
      .eq('fingerprint', fingerprint)
      .eq('resolved', false)

    if (opts.clinicId) {
      const { data: existing } = await dedupQuery.eq('clinic_id', opts.clinicId).maybeSingle()
      if (existing) {
        const newCount = existing.occurrence_count + 1
        await admin.from('error_logs').update({ occurrence_count: newCount }).eq('id', existing.id)
        return { isNew: false, id: existing.id, occurrenceCount: newCount }
      }
    } else {
      // Sem clinic_id: dedup por fingerprint global (source=vercel/edge)
      const { data: existing } = await dedupQuery.is('clinic_id', null).maybeSingle()
      if (existing) {
        const newCount = existing.occurrence_count + 1
        await admin.from('error_logs').update({ occurrence_count: newCount }).eq('id', existing.id)
        return { isNew: false, id: existing.id, occurrenceCount: newCount }
      }
    }

    const { data, error } = await admin.from('error_logs').insert({
      clinic_id:        opts.clinicId  ?? null,
      user_id:          opts.userId    ?? null,
      path:             opts.path,
      error_message:    message,
      stack_trace:      stack           ?? null,
      user_journey:     opts.userJourney ?? [],
      severity:         'error',
      source:           opts.source    ?? 'server',
      module:           opts.module    ?? null,
      priority:         opts.priority  ?? 'P1',
      fingerprint,
      occurrence_count: 1,
      resolved:         false,
    }).select('id').single()

    if (error || !data) {
      console.error('[error-logger] falha ao inserir:', error?.message)
      return failed
    }

    return { isNew: true, id: data.id, occurrenceCount: 1 }
  } catch (logErr) {
    // Nunca deixar o logger derrubar a aplicação
    console.error('[error-logger] falha ao persistir erro no banco:', logErr)
    return failed
  }
}
