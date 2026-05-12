import { chromium } from '@playwright/test'
import { seedClinics, seedUsers, seedTutorsAndPets, seedProductPrices } from './helpers/db-seed'
import * as dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), 'vetmax-app', '.env.local') })

export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000'
export const AUTH_DIR  = path.resolve(process.cwd(), 'tests/.auth')

// Todas as roles que precisam de sessão salva
const ROLES = [
  { key: 'admin',        email: 'admin@clinica-alfa.test',      password: 'TestPassword@123' },
  { key: 'vet',          email: 'vet@clinica-alfa.test',         password: 'TestPassword@123' },
  { key: 'receptionist', email: 'recepcao@clinica-alfa.test',    password: 'TestPassword@123' },
  { key: 'assistant',    email: 'assistente@clinica-alfa.test',  password: 'TestPassword@123' },
  { key: 'accountant',   email: 'contador@clinica-alfa.test',    password: 'TestPassword@123' },
  { key: 'adminB',       email: 'admin@clinica-beta.test',       password: 'TestPassword@123' },
]

export default async function globalSetup() {
  console.log('\n[SETUP] Seeding test database...')
  await seedClinics()
  await seedUsers()
  await seedTutorsAndPets()
  await seedProductPrices()
  console.log('[SETUP] Database seeded.\n')

  fs.mkdirSync(AUTH_DIR, { recursive: true })
  console.log('[SETUP] Generating storageState per role via UI login...')

  const browser = await chromium.launch()
  let failures = 0

  for (const role of ROLES) {
    const statePath = path.join(AUTH_DIR, `${role.key}.json`)
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()

      // Navega até o login — timeout generoso para o primeiro compile do Next.js dev
      await page.goto(`${BASE_URL}/login`, { timeout: 90_000 })
      await page.locator('#email').waitFor({ state: 'visible', timeout: 30_000 })

      await page.fill('#email', role.email)
      await page.fill('#password', role.password)
      await page.getByRole('button', { name: /entrar/i }).click()

      // Aguarda redirecionar para o dashboard (confirma login bem-sucedido)
      await page.waitForURL(/\/dashboard/, { timeout: 45_000 })

      // Salva o estado completo do browser (cookies + localStorage do @supabase/ssr)
      await ctx.storageState({ path: statePath })
      console.log(`[SETUP] ✓ storageState salvo: ${role.key} (${role.email})`)
    } catch (err) {
      failures++
      console.error(`[SETUP] ✗ FALHOU: ${role.key} (${role.email}) — ${(err as Error).message}`)
      // Escreve estado vazio para que loginViaApi use o fallback de injeção direta
      fs.writeFileSync(statePath, JSON.stringify({ cookies: [], origins: [] }))
    } finally {
      await ctx.close()
    }
  }

  await browser.close()

  if (failures > 0) {
    console.warn(`[SETUP] ⚠️  ${failures} role(s) sem storageState — usando fallback de injeção de cookies.\n`)
  } else {
    console.log('[SETUP] ✅ Todos os storageStates prontos.\n')
  }
}
