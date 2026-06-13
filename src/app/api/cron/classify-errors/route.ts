import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyError } from '@/lib/error-classifier'
import { runAutoFixCycle } from '@/lib/fix-planner'

// GET /api/cron/classify-errors
// Invocado pelo Vercel Cron a cada hora.
// 1. Classifica erros sem module (priority/module ausentes) via Claude Haiku.
// 2. Após classificar, aciona runAutoFixCycle para P0 e clusters acima do threshold.

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Busca erros recentes sem módulo classificado (indica que passaram pelo logger sem IA)
  const { data: unclassified, error: fetchErr } = await admin
    .from('error_logs')
    .select('id, path, error_message, stack_trace, source')
    .eq('resolved', false)
    .is('module', null)
    .order('created_at', { ascending: false })
    .limit(60)

  if (fetchErr) {
    console.error('[classify-cron] Erro ao buscar não classificados:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const rows = unclassified ?? []
  let classified = 0
  let failed     = 0

  for (const log of rows) {
    try {
      const result = await classifyError({
        path:         log.path,
        errorMessage: log.error_message,
        stackTrace:   log.stack_trace ?? undefined,
        source:       log.source,
      })

      await admin
        .from('error_logs')
        .update({ priority: result.priority, module: result.module })
        .eq('id', log.id)

      classified++
    } catch (err) {
      console.error(`[classify-cron] Falha ao classificar log ${log.id}:`, err)
      failed++
    }
  }

  console.info(`[classify-cron] Classificados=${classified} falhas=${failed}`)

  // Sempre aciona ciclo de planos — independente de ter classificado novos erros.
  // Erros já classificados mas sem plano (ex: abaixo do threshold na execução anterior)
  // precisam ser reavaliados a cada ciclo.
  const cycleResult = await runAutoFixCycle({ maxClusters: 3 })

  return NextResponse.json({
    ok:         true,
    classified,
    failed,
    plans: cycleResult,
  })
}
