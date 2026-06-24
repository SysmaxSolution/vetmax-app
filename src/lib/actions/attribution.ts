'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type AttributionInput = {
  email?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  creative_id?: string
  landing_path?: string
}

/**
 * Registra a atribuição de campanha de um cadastro (F2 — loop de medição).
 * Desacoplado do fluxo de auth: NUNCA bloqueia o signup (best-effort, try/catch).
 */
export async function recordAttribution(data: AttributionInput): Promise<void> {
  try {
    // Só grava se houver algum sinal de campanha (evita ruído de tráfego direto).
    if (!data.utm_source && !data.utm_campaign && !data.utm_content && !data.creative_id) return
    const admin = createAdminClient()
    await admin.from('marketing_attribution').insert({
      email: data.email ?? null,
      utm_source: data.utm_source ?? null,
      utm_medium: data.utm_medium ?? null,
      utm_campaign: data.utm_campaign ?? null,
      utm_content: data.utm_content ?? null,
      creative_id: data.creative_id ?? null,
      landing_path: data.landing_path ?? null,
    })
  } catch {
    // medição é best-effort; falha aqui jamais afeta o cadastro
  }
}
