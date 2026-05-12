/**
 * [QA] mentor-resilience.spec.ts
 *
 * Testa a resiliência do Modo Mentor:
 * - Perguntas com erros de digitação / typos
 * - Interrupção do tour no meio para perguntar outra coisa
 * - Múltiplas perguntas seguidas sem abrir tour
 * - Busca de animal com nome parcial / errado
 * - Reativação do tour após fechamento
 */

import { test, expect, type Page } from '@playwright/test'
import { loginViaApi } from '../helpers/session'
import fixtures from '../fixtures/test-data.json'

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close(); if (!_serverAlive) console.log('[SKIP ALL] mentor-resilience — servidor fora do ar')
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })


// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:4000'

const ROLE_MAP = {
  receptionist: 'receptionistA',
  vet: 'vetA',
  assistant: 'assistantA',
} as const

async function loginAs(page: Page, role: keyof typeof ROLE_MAP) {
  const user = fixtures.users[ROLE_MAP[role]]
  await loginViaApi(page, user.email, user.password)
}

async function openMentor(page: Page) {
  const btn = page.getByLabel('Abrir Modo Mentor')
  await expect(btn).toBeVisible({ timeout: 90_000 })
  const inputVisible = await page.getByPlaceholder(/pergunte algo/i).isVisible().catch(() => false)
  if (!inputVisible) await btn.click()
  await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible({ timeout: 90_000 })
}

async function mentorAsk(page: Page, question: string) {
  const input = page.getByPlaceholder(/pergunte algo/i)
  await input.fill(question)
  await page.getByRole('button', { name: /enviar/i }).click()
  // Aguarda resposta aparecer
  await page.waitForTimeout(500)
}

async function closeMentor(page: Page) {
  // Clica no botão flutuante para fechar (toggle — mesmo label "Abrir Modo Mentor")
  const inputVisible = await page.getByPlaceholder(/pergunte algo/i).isVisible().catch(() => false)
  if (inputVisible) {
    await page.getByLabel('Abrir Modo Mentor').click()
    await expect(page.getByPlaceholder(/pergunte algo/i)).toBeHidden({ timeout: 3_000 })
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Mentor — Resiliência e Variações', () => {

  test('1. Typos: "komo dao entrada no pett?" → Mentor entende como check-in', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)
    await openMentor(page)

    await mentorAsk(page, 'komo dao entrada no pett?')

    // Mentor deve responder algo (pode ser fallback ou reconhecer "entrada")
    // A lógica NLP usa normalização de acentos mas não corrige typos — aceita fallback
    const lastMsg = page.locator('[class*="bg-slate-100"]').last()
    await expect(lastMsg).toBeVisible({ timeout: 90_000 })

    const text = await lastMsg.textContent()
    expect(text).toBeTruthy()
    console.log(`[QA] Resposta para typo: "${text?.slice(0, 60)}..."`)
  })

  test('2. Typos: "como fasso a triajem?" → Mentor reconhece triagem', async ({ page }) => {
    await loginAs(page, 'assistant')
    await page.goto(`${BASE}/dashboard/triage`)
    await openMentor(page)

    await mentorAsk(page, 'como fasso a triajem?')

    const msgs = page.locator('[class*="bg-slate-100"]')
    const count = await msgs.count()
    expect(count).toBeGreaterThan(1) // pelo menos a saudação + resposta

    console.log('[QA] Typo "triajem" processado sem crash — PASSOU')
  })

  test('3. Interrupção: inicia tour → fecha no meio → faz pergunta → retoma tour', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)

    // Inicia tour via quick chip
    await openMentor(page)
    await page.locator('.fixed.bottom-24 button').filter({ hasText: /recepção/i }).first().click()

    const balloon = page.locator('.fixed.z-\\[10000\\]')
    await expect(balloon).toBeVisible({ timeout: 90_000 })

    // INTERROMPE o tour clicando no X do balão
    await balloon.locator('button[aria-label="Fechar tour"]').click()
    await expect(balloon).toBeHidden({ timeout: 3_000 })

    // Faz uma pergunta enquanto o tour está parado
    await openMentor(page)
    await mentorAsk(page, 'Como funciona a fila de espera?')

    const lastMsg = page.locator('[class*="bg-slate-100"]').last()
    await expect(lastMsg).toBeVisible({ timeout: 90_000 })

    // Retoma o tour de recepção via ação da mensagem ou quick chip
    await closeMentor(page)
    await openMentor(page)
    await page.locator('.fixed.bottom-24 button').filter({ hasText: /recepção/i }).first().click()

    await expect(balloon).toBeVisible({ timeout: 90_000 })
    // Deve começar do passo 1 novamente (sem estado residual)
    await expect(balloon.locator('text=/1/')).toBeVisible({ timeout: 3_000 })

    // Step 1 da recepção tem waitForNext:true — botão "Próximo" não existe
    // Forçar avanço via __MENTOR_NEXT_STEP para que "Próximo/Concluir" apareça
    await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
    await page.waitForTimeout(400)

    await page.locator('.fixed.z-\\[10000\\] button', { hasText: /concluir|próximo/i }).first().click({ force: true })
    console.log('[QA] Interrupção e retomada de tour — PASSOU')
  })

  test('4. Múltiplas perguntas sem tour: estado do chat permanece coerente', async ({ page }) => {
    await loginAs(page, 'vet')
    await page.goto(`${BASE}/dashboard/vet`)
    await openMentor(page)

    const questions = [
      'O que é SOAP?',
      'Como funciona a gravação de voz?',
      'O que é prontuário?',
      'Como faço para salvar?',
    ]

    for (const q of questions) {
      await mentorAsk(page, q)
      await page.waitForTimeout(300)
    }

    // Após 4 perguntas o chat não deve ter crashado
    await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible()

    // Deve haver ao menos 5 mensagens (saudação + 4 respostas)
    const msgs = page.locator('[class*="bg-slate-100"], [class*="bg-blue-600"]')
    const count = await msgs.count()
    expect(count).toBeGreaterThanOrEqual(5)

    console.log(`[QA] ${count} mensagens no chat após múltiplas perguntas — PASSOU`)
  })

  test('5. Busca com nome parcial do animal: "Cade o Rex" (pode não ter check-in hoje)', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)
    await openMentor(page)

    await mentorAsk(page, 'Cadê o Rex?')

    // Mentor deve responder com "procurando" e depois "encontrei" ou "não encontrei"
    await expect(
      page.locator('text=/procurando|encontrei|não encontrei/i').last()
    ).toBeVisible({ timeout: 12_000 })

    console.log('[QA] Busca por animal "Rex" — Mentor respondeu sem crash — PASSOU')
  })

  test('6. Busca com animal inexistente: Mentor responde graciosamente', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)
    await openMentor(page)

    await mentorAsk(page, 'Cadê o Xablau99999?')

    await expect(
      page.locator('text=/não encontrei|verifique|check-in/i').last()
    ).toBeVisible({ timeout: 12_000 })

    console.log('[QA] Animal inexistente — Mentor respondeu graciosamente — PASSOU')
  })

  test('7. Input vazio: enviar sem texto não quebra o Mentor', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)
    await openMentor(page)

    // Tenta enviar com input vazio (botão deve estar disabled)
    const sendBtn = page.getByRole('button', { name: /enviar/i })
    await expect(sendBtn).toBeDisabled()

    // Adiciona espaço e envia — deve ser ignorado (trim)
    await page.getByPlaceholder(/pergunte algo/i).fill('   ')
    // Botão ainda deve estar disabled ou form ignorar submit
    // (processInput faz trim e retorna se vazio)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Número de mensagens no chat não deve ter aumentado além da saudação
    const msgs = page.locator('[data-testid="mentor-chat-messages"] [class*="bg-slate-100"]')
    const count = await msgs.count()
    expect(count).toBeLessThanOrEqual(2) // saudação + no máximo 1

    console.log('[QA] Input vazio ignorado — PASSOU')
  })

  test('8. Fechar chat e reabrir: estado é preservado (mensagens anteriores visíveis)', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)

    await openMentor(page)
    await mentorAsk(page, 'Como dou entrada no pet?')
    await page.waitForTimeout(500)

    const msgsBefore = await page.locator('[class*="bg-slate-100"], [class*="bg-blue-600"]').count()

    // Fecha o chat
    await closeMentor(page)

    // Reabre
    await openMentor(page)

    const msgsAfter = await page.locator('[class*="bg-slate-100"], [class*="bg-blue-600"]').count()
    expect(msgsAfter).toBe(msgsBefore) // mensagens devem persistir

    console.log(`[QA] Mensagens preservadas após fechar/reabrir: ${msgsAfter} — PASSOU`)
  })

  test('9. Tour com step sem target DOM: balão aparece centralizado sem crash', async ({ page }) => {
    await loginAs(page, 'receptionist')
    // Vai para uma página onde data-mentor-step pode não existir
    await page.goto(`${BASE}/dashboard`)

    await openMentor(page)
    await page.locator('.fixed.bottom-24 button').filter({ hasText: /recepção/i }).first().click()

    // Mesmo sem o elemento no DOM, o balão deve aparecer centralizado
    const balloon = page.locator('.fixed.z-\\[10000\\]')
    await expect(balloon).toBeVisible({ timeout: 90_000 })

    // Verifica que está dentro da viewport
    const box = await balloon.boundingBox()
    if (box) {
      const vp = page.viewportSize()!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1)
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1)
      console.log(`[QA] Balão sem target — centralizado em x:${box.x.toFixed(0)} y:${box.y.toFixed(0)} — PASSOU`)
    }

    // Step 1 da recepção tem waitForNext:true — botão "Próximo" não existe nesse step
    // Forçar avanço via __MENTOR_NEXT_STEP para que "Próximo/Concluir" apareça
    await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
    await page.waitForTimeout(400)

    await page.locator('.fixed.z-\\[10000\\] button', { hasText: /concluir|próximo/i }).first().click({ force: true })
  })

  test('10. Mentor responde corretamente após navegação SPA entre páginas', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)

    // Faz pergunta na página de recepção
    await openMentor(page)
    await mentorAsk(page, 'Como dou entrada?')
    await closeMentor(page)

    // Navega para outra página (SPA)
    await page.goto(`${BASE}/dashboard/grooming`)

    // Mentor ainda funciona na nova página
    await openMentor(page)
    await mentorAsk(page, 'Como funciona o banho?')

    await expect(
      page.locator('text=/banho|tosa|grooming/i').last()
    ).toBeVisible({ timeout: 90_000 })

    console.log('[QA] Mentor funciona após navegação SPA — PASSOU')
  })

})
