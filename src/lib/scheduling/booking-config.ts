// Resolução PURA da configuração de agendamento online da clínica.
// Lê as flags de clinics.flow_config e aplica os padrões seguros.

export type BookingMode = 'off' | 'reception' | 'direct'

export interface BookingConfig {
  portalEnabled: boolean
  portalMode:    BookingMode
  whatsappMode:  BookingMode
}

interface FlowConfigLike {
  portal_enabled?:        boolean
  booking_mode_portal?:   string
  booking_mode_whatsapp?: string
}

function normMode(v: string | undefined, fallback: BookingMode): BookingMode {
  return v === 'off' || v === 'reception' || v === 'direct' ? v : fallback
}

/** Padrões seguros: portal desligado; ambos os canais 'reception' (= fluxo M9 atual). */
export function resolveBookingConfig(flow: FlowConfigLike | null | undefined): BookingConfig {
  const f = flow ?? {}
  return {
    portalEnabled: f.portal_enabled === true,
    portalMode:    normMode(f.booking_mode_portal, 'reception'),
    whatsappMode:  normMode(f.booking_mode_whatsapp, 'reception'),
  }
}

/** O tutor pode agendar PELO PORTAL? (portal ligado e canal não 'off') */
export function portalBookingAllowed(cfg: BookingConfig): boolean {
  return cfg.portalEnabled && cfg.portalMode !== 'off'
}
