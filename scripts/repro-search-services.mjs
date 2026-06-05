// repro-search-services.mjs — reproduz em PRODUÇÃO a falha do searchServices
// (HF5 follow-up, 05/06): loga com usuário de teste, abre o consultório,
// abre "Inserir serviços" e captura a resposta REAL do POST da server action.
//
// Uso: node scripts/repro-search-services.mjs [--url=https://...]

import { chromium } from '@playwright/test'

const BASE = process.argv.find(a => a.startsWith('--url='))?.slice(6)
  ?? 'https://sysvetmax.sysmaxsolutions.com'

// Credenciais via env — NUNCA commitar senhas reais.
//   $env:REPRO_EMAIL='...'; $env:REPRO_PASS='...'; node scripts/repro-search-services.mjs
const EMAIL = process.env.REPRO_EMAIL
const PASS  = process.env.REPRO_PASS
if (!EMAIL || !PASS) {
  console.error('Defina REPRO_EMAIL e REPRO_PASS no ambiente.')
  process.exit(1)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

// Captura TODOS os POSTs de server action e seus status/corpos
page.on('response', async res => {
  const req = res.request()
  if (req.method() !== 'POST') return
  const url = res.url()
  if (!url.includes(BASE.replace('https://', ''))) return
  let body = ''
  try { body = (await res.text()).slice(0, 500) } catch { body = '(corpo ilegível)' }
  console.log(`\n[POST ${res.status()}] ${url}`)
  if (res.status() >= 400 || body.includes('error') || body.includes('Error')) {
    console.log(`  headers next-action: ${req.headers()['next-action'] ?? '-'}`)
    console.log(`  body: ${body.replace(/\n/g, ' ')}`)
  }
})
page.on('console', msg => {
  if (msg.type() === 'error') console.log(`[console.error] ${msg.text().slice(0, 300)}`)
})

console.log(`1. Login em ${BASE} ...`)
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASS)
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard**', { timeout: 60000 })
console.log('   ✓ logado')

console.log('2. Abrindo fila do consultório ...')
await page.goto(`${BASE}/dashboard/vet`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2000)

// Abre a primeira consulta da fila (link para /dashboard/vet/[id])
const firstCard = page.locator('a[href*="/dashboard/vet/"]').first()
const hasCard = await firstCard.count()
if (!hasCard) {
  console.log('   (fila vazia — incluindo paciente via botão)')
  await page.click('text=Incluir Paciente')
  await page.fill('input[placeholder*="Buscar"]', 'a')
  await page.waitForTimeout(1500)
  await page.locator('button:has-text("Tutor:")').first().click()
  await page.click('text=Incluir na Fila')
  await page.waitForTimeout(2000)
  await page.goto(`${BASE}/dashboard/vet`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}
await page.locator('a[href*="/dashboard/vet/"]').first().click()
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2500)
console.log(`   ✓ consulta aberta: ${page.url()}`)

console.log('3. Abrindo "Inserir serviços / itens" ...')
const insertBtn = page.locator('button:has-text("Inserir serviços")')
if (await insertBtn.count() === 0) {
  console.log('   ✗ botão não encontrado — conteúdo da página:')
  console.log((await page.locator('body').innerText()).slice(0, 800))
} else {
  await insertBtn.first().click()
  console.log('   ✓ modal aberto — aguardando resposta da busca (8s)...')
  await page.waitForTimeout(8000)
  const modalText = await page.locator('[role="dialog"]').last().innerText().catch(() => '(modal sumiu)')
  console.log('\n=== CONTEÚDO DO MODAL ===')
  console.log(modalText.slice(0, 600))
}

await browser.close()
console.log('\nFim da reprodução.')
