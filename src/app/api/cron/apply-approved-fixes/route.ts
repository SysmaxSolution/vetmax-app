import { NextRequest, NextResponse } from 'next/server'
import { processAllApprovedPlans, applyApprovedFixPlan } from '@/lib/fix-applier'

// Garante runtime Node.js (não Edge) — precisa de fs/child_process.
export const runtime = 'nodejs'

// Aumenta timeout para operações longas (Claude + git) — máx 300s no Vercel Pro.
export const maxDuration = 300

/**
 * POST /api/cron/apply-approved-fixes
 *   - Autenticação: header Authorization: Bearer <CRON_SECRET>
 *   - Body opcional: { planId?: string, dryRun?: boolean }
 *
 * Comportamento:
 *   - Sem body ou sem planId → processa TODOS os planos status='approved' (limit 5)
 *   - Com planId → aplica apenas aquele plano específico
 *
 * Disparado de duas formas:
 *   1. Vercel Cron periódico (a cada 5min) — pega planos approved que ficaram presos
 *   2. Fire-and-forget após approveFixPlan / handleDirectorCommand (planId específico)
 */

async function authorize(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function POST(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { planId?: string; dryRun?: boolean } = {}
  try {
    const ct = request.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      body = await request.json().catch(() => ({}))
    }
  } catch {
    // body opcional
  }

  if (body.planId) {
    const result = await applyApprovedFixPlan(body.planId, { dryRun: body.dryRun })
    return NextResponse.json({
      mode:   'single',
      planId: body.planId,
      result,
    })
  }

  const batch = await processAllApprovedPlans({ maxPlans: 5, dryRun: body.dryRun })
  return NextResponse.json({
    mode:      'batch',
    processed: batch.processed,
    succeeded: batch.succeeded,
    failed:    batch.failed,
    results:   batch.results,
  })
}

// GET para o Vercel Cron (não aceita POST em alguns triggers)
export async function GET(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const batch = await processAllApprovedPlans({ maxPlans: 5 })
  return NextResponse.json({
    mode:      'batch',
    processed: batch.processed,
    succeeded: batch.succeeded,
    failed:    batch.failed,
  })
}
