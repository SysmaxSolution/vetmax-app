// Limites (quotas) por plano — módulo PURO, usado pelo sync (server) e pelos
// cards de plano (client). Specialized não usa este mapa (limites sob medida,
// geridos pelo runbook scripts/set-specialized-plan.mjs).

export const PLAN_LIMITS = {
  free:       { users: 3,   documents: 3 },
  premium:    { users: 10,  documents: 10 },
  enterprise: { users: 999, documents: 999999 },
} as const

export type LimitedPlan = keyof typeof PLAN_LIMITS

/** Valor sentinela tratado como "ilimitado" na exibição. */
export function isUnlimited(limit: number): boolean {
  return limit >= 999
}
