import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const CLINIC_ALFA = '11111111-1111-1111-1111-111111111111'
const REASONS = ['consultation', 'vaccination', 'surgery', 'exam', 'emergency', 'grooming']

// Elenco diverso de tutores e pets (espécies/raças/portes/gênero variados) para os criativos.
const TUTORS = [
  { name: 'Marina Costa', cpf: '222.333.444-55', email: 'marina@demo.test', phone: '11988880002' },
  { name: 'Júlia Ferreira', cpf: '333.444.555-66', email: 'julia@demo.test', phone: '11988880003' },
  { name: 'Pedro Almeida', cpf: '444.555.666-77', email: 'pedro@demo.test', phone: '11988880004' },
  { name: 'Ana Beatriz Rocha', cpf: '555.666.777-88', email: 'anabia@demo.test', phone: '11988880005' },
  { name: 'Roberto Lima', cpf: '666.777.888-99', email: 'roberto@demo.test', phone: '11988880006' },
]
const PETS = [
  { name: 'Mia', species: 'cat', breed: 'Siamês', gender: 'female' },
  { name: 'Thor', species: 'dog', breed: 'Bulldog Francês', gender: 'male' },
  { name: 'Luna', species: 'cat', breed: 'SRD', gender: 'female' },
  { name: 'Bento', species: 'dog', breed: 'Golden Retriever', gender: 'male' },
  { name: 'Nina', species: 'rabbit', breed: 'Mini Lop', gender: 'female' },
  { name: 'Pingo', species: 'bird', breed: 'Calopsita', gender: 'male' },
  { name: 'Aurora', species: 'dog', breed: 'Pastor Alemão', gender: 'female' },
  { name: 'Tito', species: 'cat', breed: 'Persa', gender: 'male' },
  { name: 'Amora', species: 'dog', breed: 'Poodle', gender: 'female' },
]

/** Popula tutores/pets diversos + agenda colorida + financeiro não-zero para os criativos. */
async function enrichDemo() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, key, { auth: { persistSession: false } })

  // 1) Tutores diversos
  const tutorRows = TUTORS.map((t) => ({ id: crypto.randomUUID(), clinic_id: CLINIC_ALFA, ...t }))
  await admin.from('tutors').upsert(tutorRows)
  // 2) Pets diversos (distribuídos entre os tutores)
  const petRows = PETS.map((p, i) => ({
    id: crypto.randomUUID(),
    clinic_id: CLINIC_ALFA,
    tutor_id: tutorRows[i % tutorRows.length].id,
    neutered: i % 2 === 0,
    ...p,
  }))
  const { error: petErr } = await admin.from('patients').upsert(petRows)
  console.log(petErr ? `[enrich] erro pets: ${petErr.message}` : `[enrich] ✓ ${petRows.length} pets diversos`)

  // 3) Agenda colorida usando os pets diversos
  const days = [2, 3, 4, 5, 9, 10, 11, 12, 16, 17, 18, 19, 23, 24, 25, 26]
  const hours = [9, 10, 11, 14, 15, 16, 17]
  const appts = days.map((d, i) => {
    const pet = petRows[i % petRows.length]
    return {
      clinic_id: CLINIC_ALFA,
      pet_id: pet.id,
      tutor_id: pet.tutor_id,
      appointment_datetime: `2026-06-${String(d).padStart(2, '0')}T${String(hours[i % hours.length]).padStart(2, '0')}:00:00-03:00`,
      reason: REASONS[i % REASONS.length],
      status: i % 3 === 0 ? 'confirmed' : 'scheduled',
    }
  })
  const { error: apptErr } = await admin.from('appointments').insert(appts)
  console.log(apptErr ? `[enrich] erro agenda: ${apptErr.message}` : `[enrich] ✓ ${appts.length} agendamentos`)

  // 4) Financeiro não-zero (contas a receber, mix pago/pendente)
  const fin = petRows.slice(0, 8).map((pet, i) => ({
    clinic_id: CLINIC_ALFA,
    type: 'receivable',
    description: `${REASONS[i % REASONS.length] === 'surgery' ? 'Cirurgia' : 'Consulta'} — ${pet.name}`,
    amount: [120, 90, 450, 180, 75, 260, 140, 320][i],
    due_date: `2026-06-${String(10 + i).padStart(2, '0')}`,
    status: i % 3 === 0 ? 'paid' : 'pending',
    tutor_id: pet.tutor_id,
    patient_id: pet.id,
  }))
  const { error: finErr } = await admin.from('financial_entries').insert(fin)
  console.log(finErr ? `[enrich] erro financeiro: ${finErr.message}` : `[enrich] ✓ ${fin.length} lançamentos financeiros`)
}

/**
 * Captura telas REAIS do SYSVETMAX (clínica-demo seedada pelo globalSetup) para
 * uso nos criativos de marketing. Login via UI (fluxo do injectFreshSession),
 * dados de demo (LGPD ok). Ciclo: globalSetup (seed) → este spec → teardown.
 */
const OUT = resolve(process.cwd(), 'Marketing/video/public/app')
mkdirSync(OUT, { recursive: true })

const EMAIL = 'admin@clinica-alfa.test'
const PASS = 'TestPassword@123'

const PAGES = [
  { slug: 'dashboard', path: '/dashboard' },
  { slug: 'cashier', path: '/dashboard/cashier' },
  { slug: 'agenda', path: '/dashboard/reception/calendar' },
  { slug: 'patients', path: '/dashboard/patients' },
  { slug: 'financial', path: '/dashboard/financial' },
  { slug: 'whatsapp', path: '/dashboard/whatsapp' },
  { slug: 'vet', path: '/dashboard/vet' },
  { slug: 'billing', path: '/dashboard/billing' },
  { slug: 'reception', path: '/dashboard/reception' },
  { slug: 'hospitalization', path: '/dashboard/hospitalization' },
  { slug: 'exams', path: '/dashboard/exams' },
  { slug: 'grooming', path: '/dashboard/grooming' },
  { slug: 'pharmacy', path: '/dashboard/pharmacy' },
  { slug: 'purchases', path: '/dashboard/purchases' },
  { slug: 'surgery', path: '/dashboard/surgery' },
  { slug: 'registry', path: '/dashboard/registry' },
]

test.use({
  storageState: { cookies: [], origins: [] }, // sessão limpa: faremos login via UI
  viewport: { width: 1680, height: 1050 },
  deviceScaleFactor: 2,
})

// Só roda sob demanda (MARKETING_CAPTURE=1) — fora da bateria E2E normal.
test.skip(process.env.MARKETING_CAPTURE !== '1', 'utilitário de captura de marketing (defina MARKETING_CAPTURE=1)')

test('captura de telas para marketing', async ({ page }) => {
  test.setTimeout(900_000)

  await enrichDemo()

  // Login via UI
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.locator('#email').waitFor({ state: 'visible', timeout: 30_000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASS)
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 90_000, waitUntil: 'domcontentloaded' })
  // espera o app sair do splash (logo de carregamento some quando o shell monta)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(3500)
  // eslint-disable-next-line no-console
  console.log('[capture] login OK →', page.url())

  for (const p of PAGES) {
    try {
      await page.goto(p.path, { waitUntil: 'commit', timeout: 120_000 })
      // garante que não estamos no /login (sessão válida)
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {})
      await page.waitForTimeout(3000) // assenta skeletons/dados em dev mode
      await page.screenshot({ path: resolve(OUT, `${p.slug}.png`), fullPage: false })
      // eslint-disable-next-line no-console
      console.log(`[capture] ✓ ${p.slug}`)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[capture] ✗ ${p.slug}: ${(e as Error).message.split('\n')[0]}`)
    }
  }
})
