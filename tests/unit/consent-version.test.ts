/**
 * Unit — Frente 1 (council 2026-06-24): versão/staleness do consentimento LGPD.
 *
 * O termo evoluiu para 1.1 (cláusula de voz/IA). Tutores que aceitaram uma versão
 * anterior, ou nunca consentiram, ficam "stale" → re-aceite forçado no check-in
 * e aviso ao MV no consultório.
 *
 * Alvo: src/lib/consent-version.ts
 */

import { CONSENT_VERSION, isConsentStale } from '@/lib/consent-version'

describe('consent-version — isConsentStale', () => {
  test('TC-CV-001 → tutor que nunca consentiu está stale', () => {
    expect(isConsentStale(false, null)).toBe(true)
  })

  test('TC-CV-002 → consentimento numa versão anterior (1.0) está stale', () => {
    expect(isConsentStale(true, '1.0')).toBe(true)
  })

  test('TC-CV-003 → consentimento na versão vigente NÃO está stale', () => {
    expect(isConsentStale(true, CONSENT_VERSION)).toBe(false)
  })

  test('TC-CV-004 → consent_given true mas versão null está stale', () => {
    expect(isConsentStale(true, null)).toBe(true)
  })

  test('TC-CV-005 → consent_given null/undefined está stale (defensivo)', () => {
    expect(isConsentStale(null, CONSENT_VERSION)).toBe(true)
    expect(isConsentStale(undefined, CONSENT_VERSION)).toBe(true)
  })

  test('TC-CV-006 → versão vigente é a esperada pós-cláusula de voz/IA', () => {
    // Trava de regressão: se o termo evoluir de novo, atualizar conscientemente.
    expect(CONSENT_VERSION).toBe('1.1')
  })
})
