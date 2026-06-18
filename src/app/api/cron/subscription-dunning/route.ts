import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { attemptSuspendSubscription, planDunningTransition } from '@/lib/billing/provision'

// GET /api/cron/subscription-dunning  (Vercel Cron, diário)
// R7 — máquina de estados da assinatura dirigida por tempo:
//   • mensal: past_due há ≥7d → tenta suspender (grace se D3 segura);
//             grace → retenta suspender a cada dia até os registros fecharem.
//   • anual:  active e faltam ≤7d p/ expirar → 'expiring' (aviso de renovação);
//             active/expiring já vencido → tenta expirar (mesma carência D3).
// A decisão TEMPORAL é pura (planDunningTransition, testada); a carência clínica
// D3 é resolvida no attemptSuspendSubscription.
// D5: assinaturas grandfathered NUNCA entram no dunning (filtro is_grandfathered).
// Auth: header `authorization: Bearer ${CRON_SECRET}` (fail-closed).

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = Date.now()

  const { data: subs, error } = await admin
    .from('tenant_subscriptions')
    .select('clinic_id, lifecycle_state, billing_cycle, past_due_since, current_period_end, is_grandfathered')
    .in('lifecycle_state', ['past_due', 'grace', 'active', 'expiring'])
    .eq('is_grandfathered', false)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const actions: Array<{ clinic_id: string; action: string }> = []

  for (const sub of subs ?? []) {
    const clinicId = sub.clinic_id as string
    const decision = planDunningTransition(sub, now)
    if (!decision) continue

    try {
      if (decision.setState) {
        await admin.from('tenant_subscriptions').update({ lifecycle_state: decision.setState }).eq('clinic_id', clinicId)
        actions.push({ clinic_id: clinicId, action: decision.setState })
      } else if (decision.trySuspend) {
        const r = await attemptSuspendSubscription(admin, clinicId, decision.trySuspend)
        if (r.error) throw new Error(r.error)
        if (r.deferred) {
          // D3: registro clínico aberto → mantém acesso, fica em carência.
          await admin.from('tenant_subscriptions').update({ lifecycle_state: 'grace' }).eq('clinic_id', clinicId)
          actions.push({ clinic_id: clinicId, action: `${decision.trySuspend}→deferido(grace, D3)` })
        } else {
          actions.push({ clinic_id: clinicId, action: decision.trySuspend })
        }
      }
    } catch (e) {
      actions.push({ clinic_id: clinicId, action: 'erro: ' + (e instanceof Error ? e.message : 'desconhecido') })
    }
  }

  return NextResponse.json({ ok: true, scanned: subs?.length ?? 0, transitions: actions })
}
