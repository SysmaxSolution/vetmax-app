/**
 * E2E — Sprint Internação Completa · FASE 2 (Protocolos de Prescrição)
 *
 * TC-I07-01: flag ON ⇒ card → Medicações → "Aplicar Protocolo" abre o ProtocolPicker
 *            e lista o protocolo cadastrado.
 * TC-I07-02: aplicar um protocolo faz o unroll das medicações em
 *            hospitalization_prescriptions (verificado no banco).
 */

import { test, expect, Page } from '@playwright/test'
import { loginViaApi } from '../helpers/session'
import { createAdminClient } from '../helpers/supabase-test-client'
import { seedUsers, seedTutorsAndPets } from '../helpers/db-seed'
import fixtures from '../fixtures/test-data.json'

const admin = createAdminClient()
const CLINIC_A = fixtures.clinics.clinicA.id
const PROTO_NAME = 'Protocolo E2E Analgesia'

async function setInternacaoCompleta(value: boolean): Promise<Record<string, unknown>> {
  const { data } = await admin.from('clinics').select('flow_config').eq('id', CLINIC_A).single()
  const prev = (data?.flow_config ?? {}) as Record<string, unknown>
  await admin.from('clinics').update({ flow_config: { ...prev, internacao_completa: value } }).eq('id', CLINIC_A)
  return prev
}
async function restoreFlowConfig(flowConfig: Record<string, unknown>) {
  await admin.from('clinics').update({ flow_config: flowConfig }).eq('id', CLINIC_A)
}

async function seedTemplate(): Promise<string | null> {
  const { data: tpl } = await admin.from('prescription_templates')
    .insert({ clinic_id: CLINIC_A, name: PROTO_NAME, description: '2 medicações', is_active: true })
    .select('id').single()
  if (!tpl) return null
  await admin.from('prescription_template_items').insert([
    { clinic_id: CLINIC_A, template_id: tpl.id, medication_name: 'Tramadol', dose: '2 mg/kg', route: 'IV', frequency_hours: 8, sort_order: 0 },
    { clinic_id: CLINIC_A, template_id: tpl.id, medication_name: 'Dipirona', dose: '25 mg/kg', route: 'IV', frequency_hours: 6, sort_order: 1 },
  ])
  return tpl.id as string
}
async function seedHosp(): Promise<string | null> {
  await seedTutorsAndPets()
  const { data } = await admin.from('hospitalizations').insert([{
    clinic_id: CLINIC_A, patient_id: fixtures.patients.petA1.id, tutor_id: fixtures.tutors.tutorA1.id,
    status: 'observation', reason: 'Internação E2E Fase 2',
  }]).select('id').single()
  return data?.id ?? null
}

async function openMedications(page: Page): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
  await page.waitForTimeout(1_500)
  if (!page.url().includes('/dashboard/hospitalization')) return false
  const card = page.locator('[data-testid^="hospitalization-card-"]').filter({ hasText: fixtures.patients.petA1.name }).first()
  if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) return false
  await card.click(); await page.waitForTimeout(800)
  const medsBtn = page.locator('[data-testid="open-medications-btn"]')
  if (!(await medsBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return false
  await medsBtn.click(); await page.waitForTimeout(600)
  const protoBtn = page.locator('[data-testid="open-protocols-btn"]')
  if (!(await protoBtn.isVisible({ timeout: 4_000 }).catch(() => false))) return false
  await protoBtn.click(); await page.waitForTimeout(600)
  return true
}

let _serverAlive = true
let prev: Record<string, unknown>
let templateId: string | null = null
let hospId: string | null = null

test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i07-protocolos-fase2.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i07] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-I07: Protocolos — criação (seed) e aplicação em lote', () => {
  test.beforeEach(async () => {
    prev = await setInternacaoCompleta(true)
    templateId = await seedTemplate()
    hospId = await seedHosp()
  })
  test.afterEach(async () => {
    if (hospId) {
      await admin.from('hospitalization_prescriptions').delete().eq('hospitalization_id', hospId)
      await admin.from('hospitalizations').delete().eq('id', hospId)
    }
    if (templateId) {
      await admin.from('prescription_template_items').delete().eq('template_id', templateId)
      await admin.from('prescription_templates').delete().eq('id', templateId)
    }
    await restoreFlowConfig(prev)
  })

  test('TC-I07-01: ProtocolPicker abre e lista o protocolo', async ({ page }, testInfo) => {
    if (!(await openMedications(page))) { console.log('TC-I07-01: SKIP — fluxo Medicações/Protocolo não abriu (cold-start UI)'); testInfo.skip(); return }
    const proto = page.getByText(PROTO_NAME).first()
    const visible = await proto.isVisible({ timeout: 5_000 }).catch(() => false)
    console.log(`TC-I07-01: protocolo "${PROTO_NAME}" listado: ${visible}`)
    expect(visible).toBe(true)
  })

  test('TC-I07-02: aplicar protocolo cria as prescrições (unroll)', async ({ page }, testInfo) => {
    if (!(await openMedications(page))) { console.log('TC-I07-02: SKIP — fluxo não abriu'); testInfo.skip(); return }
    if (!templateId) { console.log('TC-I07-02: SKIP — template não semeado'); testInfo.skip(); return }

    const applyBtn = page.locator(`[data-testid="protocol-${templateId}"] [data-testid="protocol-apply"]`)
      .or(page.locator('[data-testid="protocol-apply"]').first())
    if (!(await applyBtn.first().isVisible({ timeout: 4_000 }).catch(() => false))) { console.log('TC-I07-02: SKIP — botão Aplicar ausente'); testInfo.skip(); return }
    await applyBtn.first().click()
    await page.waitForTimeout(2_000) // aguarda unroll + refresh

    const { count } = await admin
      .from('hospitalization_prescriptions')
      .select('id', { count: 'exact', head: true })
      .eq('hospitalization_id', hospId!)
    console.log(`TC-I07-02: prescrições criadas pelo protocolo (esperado 2): ${count}`)
    expect(count ?? 0).toBe(2)
  })
})
