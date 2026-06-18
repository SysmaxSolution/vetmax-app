// Testes da lógica TEMPORAL pura do dunning (SaaS Fase 2 — R7).
// planDunningTransition decide a transição por tempo; a carência clínica D3 é
// resolvida fora (attemptSuspendSubscription, com acesso ao banco).
import {
  planDunningTransition,
  DUNNING_DAY_MS,
  DUNNING_GRACE_DAYS,
} from '@/lib/billing/provision'

const NOW = new Date('2026-06-18T12:00:00Z').getTime()
const daysAgo = (n: number) => new Date(NOW - n * DUNNING_DAY_MS).toISOString()
const daysAhead = (n: number) => new Date(NOW + n * DUNNING_DAY_MS).toISOString()

describe('planDunningTransition', () => {
  it('mensal em dia (active) → nada', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'active', billing_cycle: 'monthly', past_due_since: null, current_period_end: daysAhead(20) },
      NOW,
    )).toBeNull()
  })

  it('mensal past_due há <7d → ainda nada (janela M1)', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'past_due', billing_cycle: 'monthly', past_due_since: daysAgo(6), current_period_end: null },
      NOW,
    )).toBeNull()
  })

  it('mensal past_due há ≥7d → tenta suspender', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'past_due', billing_cycle: 'monthly', past_due_since: daysAgo(DUNNING_GRACE_DAYS), current_period_end: null },
      NOW,
    )).toEqual({ trySuspend: 'suspended' })
  })

  it('grace mensal → retenta suspender (suspended)', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'grace', billing_cycle: 'monthly', past_due_since: daysAgo(30), current_period_end: null },
      NOW,
    )).toEqual({ trySuspend: 'suspended' })
  })

  it('grace anual → retenta expirar (expired)', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'grace', billing_cycle: 'yearly', past_due_since: null, current_period_end: daysAgo(1) },
      NOW,
    )).toEqual({ trySuspend: 'expired' })
  })

  it('anual active faltando >7d p/ vencer → nada', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'active', billing_cycle: 'yearly', past_due_since: null, current_period_end: daysAhead(30) },
      NOW,
    )).toBeNull()
  })

  it('anual active faltando ≤7d → expiring (aviso de renovação)', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'active', billing_cycle: 'yearly', past_due_since: null, current_period_end: daysAhead(5) },
      NOW,
    )).toEqual({ setState: 'expiring' })
  })

  it('anual já vencido (active ou expiring) → tenta expirar', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'active', billing_cycle: 'yearly', past_due_since: null, current_period_end: daysAgo(1) },
      NOW,
    )).toEqual({ trySuspend: 'expired' })
    expect(planDunningTransition(
      { lifecycle_state: 'expiring', billing_cycle: 'yearly', past_due_since: null, current_period_end: daysAgo(1) },
      NOW,
    )).toEqual({ trySuspend: 'expired' })
  })

  it('expiring ainda dentro do prazo → nada (aguarda vencer)', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'expiring', billing_cycle: 'yearly', past_due_since: null, current_period_end: daysAhead(3) },
      NOW,
    )).toBeNull()
  })

  it('pending nunca transiciona pelo cron (aguarda 1º pagamento)', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'pending', billing_cycle: 'monthly', past_due_since: null, current_period_end: daysAhead(20) },
      NOW,
    )).toBeNull()
  })

  it('mensal sem past_due_since não suspende (sem âncora)', () => {
    expect(planDunningTransition(
      { lifecycle_state: 'past_due', billing_cycle: 'monthly', past_due_since: null, current_period_end: null },
      NOW,
    )).toBeNull()
  })
})
