/** Unit — Config de agendamento online (Fase 3). */
import { resolveBookingConfig, portalBookingAllowed } from '@/lib/scheduling/booking-config'

describe('resolveBookingConfig', () => {
  it('padrões seguros com flow vazio/nulo', () => {
    expect(resolveBookingConfig(null)).toEqual({ portalEnabled: false, portalMode: 'reception', whatsappMode: 'reception' })
    expect(resolveBookingConfig({})).toEqual({ portalEnabled: false, portalMode: 'reception', whatsappMode: 'reception' })
  })
  it('lê flags válidas', () => {
    expect(resolveBookingConfig({ portal_enabled: true, booking_mode_portal: 'direct', booking_mode_whatsapp: 'off' }))
      .toEqual({ portalEnabled: true, portalMode: 'direct', whatsappMode: 'off' })
  })
  it('valor inválido cai no padrão reception', () => {
    expect(resolveBookingConfig({ booking_mode_portal: 'xpto' as any }).portalMode).toBe('reception')
  })
  it('portalBookingAllowed exige portal ligado e canal ≠ off', () => {
    expect(portalBookingAllowed({ portalEnabled: true, portalMode: 'reception', whatsappMode: 'off' })).toBe(true)
    expect(portalBookingAllowed({ portalEnabled: true, portalMode: 'direct', whatsappMode: 'off' })).toBe(true)
    expect(portalBookingAllowed({ portalEnabled: false, portalMode: 'direct', whatsappMode: 'off' })).toBe(false)
    expect(portalBookingAllowed({ portalEnabled: true, portalMode: 'off', whatsappMode: 'direct' })).toBe(false)
  })
})
