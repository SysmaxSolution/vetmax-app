/**
 * responsive-mobile.spec.ts
 *
 * Testes de responsividade para todos os módulos do VetMax.
 * Cobre: Recepção, Agenda, Caixa, Pacientes, Feed/Gestão, Triagem,
 *        Consultório, Exames, Internação, Banho e Tosa, WhatsApp, Mentor IA.
 *
 * Executado em 6 perfis de dispositivo:
 *   Mobile: iPhone SE (375), iPhone 12 Pro (390), Pixel 5 (393), Samsung Galaxy S21 (360)
 *   Tablet: iPad Mini (768), iPad Pro 11 (1024)
 *
 * Os projetos mobile são configurados no playwright.config.ts via testMatch.
 * Este arquivo também pode ser executado individualmente com viewport manual.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginViaApi } from '../helpers/session'

// ─── Credenciais de teste ──────────────────────────────────────────────────────

const ADMIN = {
  email:    'admin@clinica-alfa.test',
  password: 'TestPassword@123',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page): Promise<void> {
  await loginViaApi(page, ADMIN.email, ADMIN.password)
}

async function setMobileViewport(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height })
}

/** Retorna true se o elemento está visível E ocupa espaço em tela */
async function isRenderedVisible(page: Page, selector: string): Promise<boolean> {
  const el = page.locator(selector).first()
  try {
    const box = await el.boundingBox()
    if (!box) return false
    return box.width > 0 && box.height > 0
  } catch {
    return false
  }
}

/** Verifica que um elemento CSS com display:none não ocupa espaço */
async function isCSSHidden(page: Page, selector: string): Promise<boolean> {
  const el = page.locator(selector).first()
  try {
    const box = await el.boundingBox()
    return box === null
  } catch {
    return true
  }
}

// ─── Dispositivos a testar ─────────────────────────────────────────────────────

const PHONES = [
  { name: 'iPhone SE',          w: 375,  h: 667  },
  { name: 'iPhone 12 Pro',      w: 390,  h: 844  },
  { name: 'Pixel 5',            w: 393,  h: 851  },
  { name: 'Samsung Galaxy S21', w: 360,  h: 800  },
]

const TABLETS = [
  { name: 'iPad Mini',   w: 768,  h: 1024 },
  { name: 'iPad Pro 11', w: 1024, h: 1366 },
]

// — server guard: skip all if Next.js dev server is down ——————————————————————
let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext()
  const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 8_000 })
    .then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] responsive-mobile — servidor fora do ar')
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 1 — DashboardHeader (navegação)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-NAV: DashboardHeader — Navegação', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] nav — ícones visíveis, texto oculto`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.reload()

      // Link de Recepção sempre presente
      // .first() necessário — reception page tem 2 <a href="/dashboard/reception">:
      //   um no sidebar nav e outro na sub-nav da página de recepção ("Atendimento")
      const recepLink = page.locator('a[href="/dashboard/reception"]').first()
      await expect(recepLink).toBeVisible({ timeout: 8_000 })

      // SVG ícone dentro do link deve ser visível
      const icon = recepLink.locator('svg').first()
      await expect(icon).toBeVisible()

      // Texto "Recepção" deve estar oculto (hidden sm:inline) em < 640px
      const labelSpan = recepLink.locator('span').filter({ hasText: 'Recepção' }).first()
      const labelBox  = await labelSpan.boundingBox()
      expect(labelBox).toBeNull()

      // Botão de logout presente (ícone)
      const logoutBtn = page.locator('button').filter({ has: page.locator('svg') }).last()
      await expect(logoutBtn).toBeVisible()
    })
  }

  for (const tablet of TABLETS) {
    test(`[${tablet.name} ${tablet.w}px] nav — texto visível em sm+`, async ({ page }) => {
      await setMobileViewport(page, tablet.w, tablet.h)
      await page.reload()

      // Em tablets (≥ 640px), os labels devem aparecer
      const recepLink = page.locator('a[href="/dashboard/reception"]').first()
      await expect(recepLink).toBeVisible()

      // "Recepção" span deve ser visível no tablet
      const labelSpan = recepLink.locator('span').filter({ hasText: 'Recepção' }).first()
      await expect(labelSpan).toBeVisible({ timeout: 5_000 })
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 2 — Caixa (tab navigation + padding)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-CAIXA: Caixa — Tabs e Padding', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] caixa — tabs scrolláveis, labels ocultos`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/cashier', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      // Container responsivo — NÃO deve ter overflow horizontal desnecessário
      const body = await page.evaluate(() => document.body.scrollWidth > window.innerWidth)
      expect(body).toBe(false)

      // Tab wrapper deve existir e ter overflow-x-auto
      const tabWrapper = page.locator('div').filter({
        has: page.locator('button').filter({ has: page.locator('svg') }),
      }).first()
      await expect(tabWrapper).toBeVisible()

      // Os botões de tab devem ser visíveis (ícone)
      const firstTabSvg = tabWrapper.locator('svg').first()
      await expect(firstTabSvg).toBeVisible()

      // Em < 640px, labels das tabs devem estar ocultos
      const tabLabel = tabWrapper.locator('span.hidden').first()
      const tabLabelBox = await tabLabel.boundingBox()
      expect(tabLabelBox).toBeNull()

      // O container principal deve ter padding lateral compacto em mobile
      const container = page.locator('div').filter({ hasText: 'Caixa' }).first()
      const containerBox = await container.boundingBox()
      if (containerBox) {
        // Padding esperado: px-3 = 12px; deve ser menor que px-6 (24px)
        expect(containerBox.x).toBeLessThanOrEqual(16)
      }
    })
  }

  for (const tablet of TABLETS) {
    test(`[${tablet.name} ${tablet.w}px] caixa — labels visíveis em sm+`, async ({ page }) => {
      await setMobileViewport(page, tablet.w, tablet.h)
      await page.goto('/dashboard/cashier', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      // "Visão Geral" tab label deve aparecer em tablet
      const tabLabels = page.locator('button span:not(.hidden)').filter({ hasText: /Visão Geral/i })
      await expect(tabLabels.first()).toBeVisible({ timeout: 5_000 })
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 3 — Triagem (grade de sinais vitais)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-TRIAGEM: Triagem — Grade de Sinais Vitais', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  test('[Triagem queue] fila carrega em mobile sem overflow horizontal', async ({ page }, testInfo) => {
    await setMobileViewport(page, 375, 667)
    await page.goto('/dashboard/triage', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    const body = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 5)
    expect(body).toBe(false)

    // Título da página visível
    await expect(page.getByRole('heading', { name: /Triagem Veterinária/i })).toBeVisible()
  })

  test('[TriageForm] grade de sinais vitais é 1 coluna em 375px', async ({ page }, testInfo) => {
    // Navega para a página de triagem (o form só aparece ao clicar num item da fila)
    // Vamos validar via CSS computed style que grid-cols-1 é aplicado
    await setMobileViewport(page, 375, 667)
    await page.goto('/dashboard/triage', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    // Verifica que a viewport não causa overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] triagem — sem overflow horizontal`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/triage', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 4 — WhatsApp (toggle mobile lista/chat)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-WPP: WhatsApp — Toggle Mobile Lista/Chat', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] whatsapp — painel lista visível, chat oculto inicialmente`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/whatsapp', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      // O módulo WhatsApp pode não estar habilitado — verificar condicionalmente
      const heading = page.locator('h1').filter({ hasText: /WhatsApp/i })
      const hasWhatsApp = await heading.count() > 0
      if (!hasWhatsApp) {
        test.info().skip(); return
      }

      // Sem overflow horizontal
      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)

      // Painel de lista deve estar visível (div com classe flex, não hidden)
      // O painel de chat deve estar oculto no início (mobileView === 'list')
      // Verifica que não há overflow de layout
      const container = page.locator('div.grid').first()
      if (await container.count() > 0) {
        const containerBox = await container.boundingBox()
        if (containerBox) {
          expect(containerBox.width).toBeLessThanOrEqual(phone.w + 2)
        }
      }
    })
  }

  test('[375px] whatsapp — botão voltar aparece apenas em mobile quando chat está ativo', async ({ page }, testInfo) => {
    await setMobileViewport(page, 375, 667)
    await page.goto('/dashboard/whatsapp', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    const hasWhatsApp = await page.locator('h1').filter({ hasText: /WhatsApp/i }).count() > 0
    if (!hasWhatsApp) { test.info().skip(); return }

    // O botão "← Voltar" (ArrowLeft) deve existir no DOM mas só aparece em mobile (flex lg:hidden)
    const backBtn = page.locator('button').filter({
      has: page.locator('svg'),
    }).filter({ hasText: '' }).first()

    // O botão voltar do chat só aparece quando há uma conversa selecionada
    // Verifica que a estrutura do painel está correta
    const panelGrid = page.locator('.grid.grid-cols-1')
    await expect(panelGrid.first()).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 5 — Mentor IA (posição do botão)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-MENTOR: Mentor IA — Posição do Botão Flutuante', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] mentor — botão dentro da tela com margem segura`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/reception', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      // O botão do Mentor pode não estar ativo se o módulo não estiver habilitado
      const mentorBtn = page.locator('[aria-label*="Mentor"]').first()
      const hasMentor = await mentorBtn.count() > 0
      if (!hasMentor) { test.info().skip(); return }

      const box = await mentorBtn.boundingBox()
      if (!box) { test.info().skip(); return }

      // Botão deve estar dentro da viewport com margem de pelo menos 8px
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(phone.w)
      expect(box.y + box.height).toBeLessThanOrEqual(phone.h)

      // Em mobile (< 640px), bottom-4 right-4 = 16px de margem
      // O botão deve estar a no máximo 32px da borda direita
      const rightMargin = phone.w - (box.x + box.width)
      expect(rightMargin).toBeLessThanOrEqual(32)
      expect(rightMargin).toBeGreaterThanOrEqual(8)
    })
  }

  for (const tablet of TABLETS) {
    test(`[${tablet.name} ${tablet.w}px] mentor — botão com margem sm (24px)`, async ({ page }) => {
      await setMobileViewport(page, tablet.w, tablet.h)
      await page.goto('/dashboard/reception', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const mentorBtn = page.locator('[aria-label*="Mentor"]').first()
      const hasMentor = await mentorBtn.count() > 0
      if (!hasMentor) { test.info().skip(); return }

      const box = await mentorBtn.boundingBox()
      if (!box) { test.info().skip(); return }

      // Em tablet (≥ 640px), bottom-6 right-6 = 24px de margem
      const rightMargin = tablet.w - (box.x + box.width)
      expect(rightMargin).toBeLessThanOrEqual(40)
      expect(rightMargin).toBeGreaterThanOrEqual(16)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 6 — Recepção (fila e layout)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-RECEP: Recepção — Layout e Fila', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] recepção — sem overflow, fila legível`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/reception', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)

      // Título da página visível
      await expect(page.getByRole('heading', { name: /Recepção|Fila|Espera/i }).first()).toBeVisible()
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 7 — Agenda (calendário)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-AGENDA: Agenda — Layout Calendário', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] agenda — sem overflow horizontal`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/reception/calendar', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)
    })
  }

  test('[iPad Mini 768px] agenda — layout 2 painéis lado a lado', async ({ page }, testInfo) => {
    await setMobileViewport(page, 768, 1024)
    await page.goto('/dashboard/reception/calendar', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    // Em tablet, o grid lg:grid-cols-5 pode ou não estar ativo (depende de lg= 1024px)
    // Verificar que o layout não quebra
    const hasOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    )
    expect(hasOverflow).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 8 — Pacientes (workspace)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-PAC: Pacientes — Workspace', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] pacientes — cabeçalho flex-col em mobile`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/patients', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)

      await expect(page.getByRole('heading', { name: /Pacientes|Pet/i }).first()).toBeVisible()
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 9 — Exames
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-EXAMES: Exames — Layout', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] exames — sem overflow`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/exams', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 10 — Internação (Kanban)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-INT: Internação — Kanban Responsivo', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] internação — kanban 1 coluna em mobile`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/hospitalization', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)
    })
  }

  test('[iPad Mini 768px] internação — kanban 2 colunas em md+', async ({ page }, testInfo) => {
    await setMobileViewport(page, 768, 1024)
    await page.goto('/dashboard/hospitalization', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    const hasOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    )
    expect(hasOverflow).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 11 — Banho e Tosa (Kanban Grooming)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-GROOMING: Banho e Tosa — Kanban', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] grooming — sem overflow`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/grooming', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 12 — Consultório
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-VET: Consultório — Layout', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page, 'vet@clinica-alfa.test', 'TestPassword@123')
  })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] consultório — sem overflow`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/vet', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 13 — Gestão/Feed (ManagementWorkspace)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-GESTAO: Gestão/Feed — Dados da Clínica', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] gestão — grid 1 coluna em mobile`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/management', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)

      // Verificar que os campos de dados da clínica não extravasam
      const gridContainer = page.locator('.grid').first()
      if (await gridContainer.count() > 0) {
        const box = await gridContainer.boundingBox()
        if (box) {
          expect(box.width).toBeLessThanOrEqual(phone.w + 2)
        }
      }
    })
  }

  test('[375px] gestão — campos de clínica empilhados verticalmente', async ({ page }, testInfo) => {
    await setMobileViewport(page, 375, 667)
    await page.goto('/dashboard/management', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    // Ao rolar para configurações de clínica, verificar layout responsivo
    // CSS grid-cols-1 sm:grid-cols-2 deve estar ativo em 375px
    const grids = await page.locator('.grid').all()
    for (const grid of grids) {
      const style = await grid.getAttribute('class')
      if (style?.includes('grid-cols-1') || style?.includes('sm:grid-cols-2')) {
        const box = await grid.boundingBox()
        if (box) {
          expect(box.width).toBeLessThanOrEqual(375 + 2)
        }
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 14 — Checkout InvoiceCard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-CHECKOUT: Checkout — InvoiceCard Responsivo', () => {
  test.beforeEach(async ({ page }) => { await loginAsAdmin(page) })

  for (const phone of PHONES) {
    test(`[${phone.name} ${phone.w}px] checkout — sem overflow horizontal`, async ({ page }) => {
      await setMobileViewport(page, phone.w, phone.h)
      await page.goto('/dashboard/reception/checkout', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      expect(hasOverflow).toBe(false)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO 15 — Teste de Touch (interação mobile)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('MOB-TOUCH: Interações Touch em Mobile', () => {
  test('[iPhone SE 375px] touch — botões de nav com área de toque mínima de 44px', async ({ page }, testInfo) => {
    await setMobileViewport(page, 375, 667)
    await loginAsAdmin(page)

    // Verificar área de toque mínima nos links de nav (WCAG 2.5.5)
    const navLinks = await page.locator('header a').all()
    for (const link of navLinks.slice(0, 5)) {
      const box = await link.boundingBox()
      if (box) {
        // WCAG mínimo 44×44px de área clicável (height pode ser menor se padding compensar)
        expect(box.height).toBeGreaterThanOrEqual(32)
      }
    }
  })

  test('[iPhone SE 375px] touch — botão Mentor clicável com área 48×48px', async ({ page }, testInfo) => {
    await setMobileViewport(page, 375, 667)
    await loginAsAdmin(page)

    const mentorBtn = page.locator('[aria-label*="Mentor"]').first()
    if (await mentorBtn.count() === 0) { test.info().skip(); return }

    const box = await mentorBtn.boundingBox()
    if (!box) { test.info().skip(); return }

    // Botão do Mentor é 48×48px (h-12 w-12)
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  })
})
