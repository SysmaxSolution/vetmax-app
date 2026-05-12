import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { logServerError, computeFingerprint } from '@/lib/error-logger'
import { classifyError } from '@/lib/error-classifier'
import { sendP0Alert } from '@/lib/p0-alert'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/webhooks/vercel-logs
// Recebe logs do Vercel Log Drain (HTTP format).
// Autenticado por HMAC-SHA1 via header x-vercel-signature.

type VercelLogEntry = {
  timestamp?:    number
  message:       string
  type?:         string   // 'stdout' | 'stderr'
  source?:       string   // 'lambda' | 'edge' | 'build' | 'static' | 'external'
  level?:        string   // 'error' | 'fatal' | 'warn' | 'info' | 'debug'
  path?:         string   // rota que gerou o log (ex: /api/mentor-chat)
  requestId?:    string
  statusCode?:   number
  deploymentId?: string
  host?:         string
  projectId?:    string
}

function verifySignature(rawBody: string, header: string, secret: string): boolean {
  try {
    // Vercel envia hex puro (sem prefixo sha1=) ou com prefixo — suportamos os dois
    const sig      = header.replace(/^sha1=/, '').toLowerCase()
    const expected = createHmac('sha1', secret).update(rawBody).digest('hex')
    const sigBuf   = Buffer.from(sig,      'hex')
    const expBuf   = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false
    return timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

function isError(entry: VercelLogEntry): boolean {
  if (entry.type === 'stderr')                        return true
  if (entry.level === 'error' || entry.level === 'fatal') return true
  if (typeof entry.statusCode === 'number' && entry.statusCode >= 500) return true
  // Mensagem contém indicadores típicos de erro Node/Next.js
  const msg = entry.message.toLowerCase()
  if (msg.includes('unhandledrejection') || msg.includes('uncaughtexception')) return true
  return false
}

function extractPath(entry: VercelLogEntry): string {
  if (entry.path) return entry.path
  // Tenta extrair caminho de API do texto da mensagem (ex: "GET /api/foo 500")
  const match = entry.message.match(/(?:GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s]+)/)
  if (match) return match[1]
  return `/${entry.source ?? 'vercel'}`
}

function parseEntries(rawBody: string): VercelLogEntry[] {
  const trimmed = rawBody.trim()
  if (!trimmed) return []

  // JSON array
  if (trimmed.startsWith('[')) return JSON.parse(trimmed)

  // NDJSON (newline-delimited)
  return trimmed
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

export async function POST(request: NextRequest) {
  const secret = process.env.VERCEL_LOG_DRAIN_SECRET
  if (!secret) {
    console.error('[Vercel Log Drain] VERCEL_LOG_DRAIN_SECRET não configurado')
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 })
  }

  const rawBody   = await request.text()
  const signature = request.headers.get('x-vercel-signature') ?? ''

  if (!verifySignature(rawBody, signature, secret)) {
    console.warn('[Vercel Log Drain] Assinatura HMAC inválida — request rejeitada')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let allEntries: VercelLogEntry[]
  try {
    allEntries = parseEntries(rawBody)
  } catch (err) {
    console.error('[Vercel Log Drain] Falha ao parsear payload:', err)
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  const errors = allEntries.filter(isError)
  console.info(`[Vercel Log Drain] ${allEntries.length} entradas recebidas, ${errors.length} erros`)

  if (errors.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const admin = createAdminClient()
  let processed = 0

  // Processa até 15 erros por batch (Vercel function timeout = 10s no hobby plan)
  for (const entry of errors.slice(0, 15)) {
    try {
      const path         = extractPath(entry)
      const errorMessage = entry.message.slice(0, 1000)
      const fingerprint  = computeFingerprint(path, errorMessage)

      // ── Dedup rápido: verifica se fingerprint já existe sem precisar inserir ──
      const { data: existing } = await admin
        .from('error_logs')
        .select('id, occurrence_count, priority')
        .eq('fingerprint', fingerprint)
        .is('clinic_id', null)
        .eq('resolved', false)
        .maybeSingle()

      if (existing) {
        const newCount = existing.occurrence_count + 1
        await admin
          .from('error_logs')
          .update({ occurrence_count: newCount })
          .eq('id', existing.id)

        // Re-alerta em P0 a cada 10 ocorrências para erros recorrentes
        if (existing.priority === 'P0' && newCount % 10 === 0) {
          await sendP0Alert({
            path,
            errorMessage,
            module:          null,
            occurrenceCount: newCount,
            severityReason:  `Erro P0 recorrente — ${newCount} ocorrências`,
          })
        }

        processed++
        continue
      }

      // ── Novo erro: classifica via Claude e persiste ──────────────────────────
      const classification = await classifyError({
        path,
        errorMessage,
        stackTrace: entry.message.length > 200 ? entry.message : undefined,
        source:     entry.source ?? 'vercel',
      })

      await logServerError({
        path,
        error:      errorMessage,
        source:     'vercel',
        module:     classification.module   ?? undefined,
        priority:   classification.priority,
        stackTrace: entry.message.length > 200 ? entry.message.slice(0, 4000) : undefined,
      })

      // ── Alerta imediato para P0 ──────────────────────────────────────────────
      if (classification.priority === 'P0') {
        await sendP0Alert({
          path,
          errorMessage,
          module:          classification.module,
          occurrenceCount: 1,
          severityReason:  classification.severity_reason,
        })
      }

      processed++
    } catch (entryErr) {
      console.error('[Vercel Log Drain] Erro ao processar entrada:', entryErr)
    }
  }

  return NextResponse.json({ ok: true, processed, total_errors: errors.length })
}
