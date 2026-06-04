/**
 * Unit — Fix B1 (reunião 04/06/2026): hierarquia de preço convênio no
 * consultório (custom → default → fallback / sem convênio).
 *
 * Bug da demo: pet Petlove com preço convênio definido no cadastro de
 * serviço, mas o consultório considerava o valor particular cheio.
 *
 * TC-B1-001..010 → decideServicePricing (src/lib/insurance-pricing-core.ts)
 */

import { decideServicePricing } from '@/lib/insurance-pricing-core'

describe('insurance-pricing — hierarquia custom → default → fallback', () => {
  test('TC-B1-001 → nível 1: pet SEM convênio cobra particular puro', () => {
    const r = decideServicePricing({
      unit_price: 120,
      default_insurance_price: 73,
      has_active_insurance: false,
      provider_name: null,
      custom: null,
    })
    expect(r.unit_price).toBe(120)
    expect(r.insurance).toBeNull()
  })

  test('TC-B1-002 → nível 2: custom com split completo é a fonte da verdade', () => {
    const r = decideServicePricing({
      unit_price: 120,
      default_insurance_price: 73,
      has_active_insurance: true,
      provider_name: 'Petlove',
      custom: { custom_price: 75.75, copay_amount: 30.21, repass_amount: 45.54 },
    })
    expect(r.insurance).toMatchObject({
      total: 75.75, copay: 30.21, repass: 45.54,
      source: 'custom', requires_split_input: false,
      provider_name: 'Petlove',
    })
  })

  test('TC-B1-003 → nível 3: cenário da demo — convênio + default no serviço usa o default (73, não 120)', () => {
    const r = decideServicePricing({
      unit_price: 120,
      default_insurance_price: 73,
      has_active_insurance: true,
      provider_name: 'Petlove',
      custom: null,
    })
    expect(r.insurance).toMatchObject({
      total: 73, copay: null, repass: null,
      source: 'default', requires_split_input: true,
    })
    // O preço aplicado à consulta deve ser 73 — NUNCA o particular 120
    expect(r.insurance!.total).not.toBe(r.unit_price)
  })

  test('TC-B1-004 → nível 4: convênio sem custom nem default cai no fallback particular + exige split', () => {
    const r = decideServicePricing({
      unit_price: 120,
      default_insurance_price: null,
      has_active_insurance: true,
      provider_name: 'Petlove',
      custom: null,
    })
    expect(r.insurance).toMatchObject({
      total: 120, source: 'fallback_unit', requires_split_input: true,
    })
  })

  test('TC-B1-005 → custom SEM split completo (copay null) não trava no nível 2 — desce para default', () => {
    // Linha importada da remessa antes do vet definir o split
    const r = decideServicePricing({
      unit_price: 120,
      default_insurance_price: 73,
      has_active_insurance: true,
      provider_name: 'Petlove',
      custom: { custom_price: 75.75, copay_amount: null, repass_amount: null },
    })
    expect(r.insurance!.source).toBe('default')
    expect(r.insurance!.total).toBe(73)
  })

  test('TC-B1-006 → custom sem split E sem default cai no fallback', () => {
    const r = decideServicePricing({
      unit_price: 120,
      default_insurance_price: null,
      has_active_insurance: true,
      provider_name: 'Petlove',
      custom: { custom_price: 75.75, copay_amount: null, repass_amount: null },
    })
    expect(r.insurance!.source).toBe('fallback_unit')
    expect(r.insurance!.total).toBe(120)
  })

  test('TC-B1-007 → custom com copay 0 explícito É split válido (backfill 0215)', () => {
    const r = decideServicePricing({
      unit_price: 120,
      default_insurance_price: 73,
      has_active_insurance: true,
      provider_name: 'Petlove',
      custom: { custom_price: 75.75, copay_amount: 0, repass_amount: 75.75 },
    })
    expect(r.insurance!.source).toBe('custom')
    expect(r.insurance!.copay).toBe(0)
    expect(r.insurance!.repass).toBe(75.75)
  })

  test('TC-B1-008 → default 0 explícito é respeitado (cortesia de convênio)', () => {
    const r = decideServicePricing({
      unit_price: 120,
      default_insurance_price: 0,
      has_active_insurance: true,
      provider_name: 'Petlove',
      custom: null,
    })
    expect(r.insurance!.source).toBe('default')
    expect(r.insurance!.total).toBe(0)
  })

  test('TC-B1-009 → sem convênio, default cadastrado é IGNORADO (particular puro)', () => {
    const r = decideServicePricing({
      unit_price: 150,
      default_insurance_price: 80,
      has_active_insurance: false,
      provider_name: null,
      custom: { custom_price: 75.75, copay_amount: 30.21, repass_amount: 45.54 },
    })
    expect(r.unit_price).toBe(150)
    expect(r.insurance).toBeNull()
  })

  test('TC-B1-010 → unit_price ausente/zerado não quebra (coerção segura)', () => {
    const r = decideServicePricing({
      unit_price: 0,
      default_insurance_price: null,
      has_active_insurance: true,
      provider_name: 'Petlove',
      custom: null,
    })
    expect(r.unit_price).toBe(0)
    expect(r.insurance!.total).toBe(0)
  })
})
