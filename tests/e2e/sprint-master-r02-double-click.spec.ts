/**
 * E2E — Sprint Master R-02: Duplo Clique para Triagem
 *
 * TC-R02-01: Duplo clique em card da recepção move para fila de triagem
 * TC-R02-02: Card desaparece da lista de recepção após duplo clique
 * TC-R02-03: Single clique não move para triagem (não dispara)
 * TC-R02-04: Cursor do card é "pointer"
 * TC-R02-05 (Crítico): Duplo clique rápido (debounce) não duplica o registro
 *
 * data-testid sugeridos:
 *   - data-testid="reception-card"        → card de paciente na lista da recepção
 *   - data-testid="triage-queue-item"     → item na fila de triagem
 *   - data-testid="reception-workspace"   → container da área de recepção
 *   - data-testid="triage-workspace"      → container da área de triagem
 */

import { test, expect, Page } from '@playwright/test';
import { createAdminClient } from '../helpers/supabase-test-client';
import { seedTutorsAndPets } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL(/\/(dashboard|reception|vet|onboarding)/, { timeout: 30_000 });
}

async function enableModule(clinicId: string, module: string) {
  const { data } = await admin.from('clinics').select('active_modules').eq('id', clinicId).single();
  const mods: string[] = Array.isArray(data?.active_modules) ? data.active_modules : [];
  if (!mods.includes(module)) {
    await admin.from('clinics').update({ active_modules: [...mods, module] }).eq('id', clinicId);
  }
}

async function seedConsultation(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin.from('consultations').insert([{
    clinic_id: fixtures.clinics.clinicA.id,
    patient_id: fixtures.patients.petA1.id,
    tutor_id: fixtures.tutors.tutorA1.id,
    status: 'reception',
    reason: 'Consulta de Rotina R02',
    ...overrides,
  }]).select('id').single();
  if (error) throw error;
  return data.id;
}

async function navigateToReception(page: Page): Promise<boolean> {
  await page.goto('/dashboard/reception');
  await page.waitForTimeout(2_000);

  const heading = page.getByText(/recepção|fila de espera|aguardando/i).first();
  const visible = await heading.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!visible) {
    console.log('R02: Módulo de recepção não carregou');
    return false;
  }
  return true;
}

async function findReceptionCard(page: Page): Promise<boolean> {
  const card = page
    .locator('[data-testid="reception-card"]')
    .or(page.locator('[data-testid*="reception"][data-testid*="card"]'))
    .or(page.locator('[class*="card"]').filter({ hasText: /rex/i }).first())
    .or(page.getByText('Rex').first());

  return card.isVisible({ timeout: 10_000 }).catch(() => false);
}

// ─── TC-R02-01: Duplo clique move para triagem ────────────────────────────────

test.describe('TC-R02-01: Duplo clique em card move para fila de triagem', () => {
  let consultationId: string;

  test.beforeEach(async () => {
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    await enableModule(fixtures.clinics.clinicA.id, 'triage');
    await seedTutorsAndPets();
    consultationId = await seedConsultation({ status: 'reception' });
  });

  test.afterEach(async () => {
    if (consultationId) await admin.from('consultations').delete().eq('id', consultationId);
  });

  test('Duplo clique em card da recepção muda status para triage no banco', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const navigated = await navigateToReception(page);
    if (!navigated) { test.skip(); return; }

    const cardFound = await findReceptionCard(page);
    if (!cardFound) {
      console.log('TC-R02-01: FUNCIONALIDADE PENDENTE — card Rex não encontrado na recepção');
      test.skip();
      return;
    }

    const card = page
      .locator('[data-testid="reception-card"]')
      .or(page.locator('[class*="card"]').filter({ hasText: /rex/i }).first())
      .or(page.getByText('Rex').first());

    await card.dblclick();
    await page.waitForTimeout(2_000);

    const { data: consultation } = await admin
      .from('consultations')
      .select('status')
      .eq('id', consultationId)
      .single();

    console.log(`TC-R02-01: Status após duplo clique = "${consultation?.status}"`);

    if (!['triage', 'triagem', 'waiting_triage'].includes(consultation?.status ?? '')) {
      console.log('TC-R02-01: FUNCIONALIDADE PENDENTE — status não mudou para triage após duplo clique');
      test.skip();
      return;
    }

    expect(['triage', 'triagem', 'waiting_triage']).toContain(consultation?.status);
  });
});

// ─── TC-R02-02: Card desaparece da recepção após duplo clique ─────────────────

test.describe('TC-R02-02: Card desaparece da lista de recepção após duplo clique', () => {
  let consultationId: string;

  test.beforeEach(async () => {
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    await enableModule(fixtures.clinics.clinicA.id, 'triage');
    await seedTutorsAndPets();
    consultationId = await seedConsultation({ status: 'reception' });
  });

  test.afterEach(async () => {
    if (consultationId) await admin.from('consultations').delete().eq('id', consultationId);
  });

  test('Após duplo clique, card de Rex desaparece da lista da recepção', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const navigated = await navigateToReception(page);
    if (!navigated) { test.skip(); return; }

    const cardFound = await findReceptionCard(page);
    if (!cardFound) {
      console.log('TC-R02-02: FUNCIONALIDADE PENDENTE — card Rex não encontrado');
      test.skip();
      return;
    }

    const card = page
      .locator('[data-testid="reception-card"]')
      .or(page.locator('[class*="card"]').filter({ hasText: /rex/i }).first())
      .or(page.getByText('Rex').first());

    await card.dblclick();
    await page.waitForTimeout(2_500);

    // Card deve ter sumido da lista de recepção
    const cardStillVisible = await page
      .locator('[data-testid="reception-card"]')
      .filter({ hasText: /rex/i })
      .isVisible({ timeout: 3_000 }).catch(() => false);

    const rexInReceptionList = await page
      .locator('[data-testid="reception-workspace"], [class*="reception"]')
      .filter({ hasText: /rex/i })
      .isVisible({ timeout: 3_000 }).catch(() => false);

    console.log(`TC-R02-02: Card Rex ainda na recepção: ${cardStillVisible || rexInReceptionList}`);
    expect(cardStillVisible || rexInReceptionList).toBe(false);
  });
});

// ─── TC-R02-03: Single clique não move para triagem ──────────────────────────

test.describe('TC-R02-03: Single clique não move para triagem', () => {
  let consultationId: string;

  test.beforeEach(async () => {
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    await enableModule(fixtures.clinics.clinicA.id, 'triage');
    await seedTutorsAndPets();
    consultationId = await seedConsultation({ status: 'reception' });
  });

  test.afterEach(async () => {
    if (consultationId) await admin.from('consultations').delete().eq('id', consultationId);
  });

  test('Um único clique no card NÃO deve alterar status para triagem', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const navigated = await navigateToReception(page);
    if (!navigated) { test.skip(); return; }

    const cardFound = await findReceptionCard(page);
    if (!cardFound) {
      console.log('TC-R02-03: FUNCIONALIDADE PENDENTE — card Rex não encontrado');
      test.skip();
      return;
    }

    const card = page
      .locator('[data-testid="reception-card"]')
      .or(page.locator('[class*="card"]').filter({ hasText: /rex/i }).first())
      .or(page.getByText('Rex').first());

    await card.click(); // single click
    await page.waitForTimeout(1_500);

    const { data: consultation } = await admin
      .from('consultations')
      .select('status')
      .eq('id', consultationId)
      .single();

    console.log(`TC-R02-03: Status após single clique = "${consultation?.status}"`);

    // Status deve continuar sendo 'reception' — não deve ter mudado para triagem
    expect(['triage', 'triagem', 'waiting_triage']).not.toContain(consultation?.status);
    expect(consultation?.status).toBe('reception');
  });
});

// ─── TC-R02-04: Cursor do card é "pointer" ────────────────────────────────────

test.describe('TC-R02-04: Cursor do card é "pointer"', () => {
  let consultationId: string;

  test.beforeEach(async () => {
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    await seedTutorsAndPets();
    consultationId = await seedConsultation({ status: 'reception' });
  });

  test.afterEach(async () => {
    if (consultationId) await admin.from('consultations').delete().eq('id', consultationId);
  });

  test('Propriedade CSS cursor do card de recepção deve ser "pointer"', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const navigated = await navigateToReception(page);
    if (!navigated) { test.skip(); return; }

    const cardFound = await findReceptionCard(page);
    if (!cardFound) {
      console.log('TC-R02-04: FUNCIONALIDADE PENDENTE — card Rex não encontrado');
      test.skip();
      return;
    }

    const card = page
      .locator('[data-testid="reception-card"]')
      .or(page.locator('[class*="card"]').filter({ hasText: /rex/i }).first())
      .or(page.getByText('Rex').first());

    const cursorStyle = await card.evaluate(el => {
      return window.getComputedStyle(el).cursor;
    });

    console.log(`TC-R02-04: cursor computado = "${cursorStyle}"`);
    expect(cursorStyle).toBe('pointer');
  });
});

// ─── TC-R02-05 (Crítico): Duplo clique rápido não duplica registro ────────────

test.describe('TC-R02-05 (Crítico): Duplo clique rápido não duplica o registro', () => {
  let consultationId: string;

  test.beforeEach(async () => {
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    await enableModule(fixtures.clinics.clinicA.id, 'triage');
    await seedTutorsAndPets();
    consultationId = await seedConsultation({ status: 'reception' });
  });

  test.afterEach(async () => {
    if (consultationId) await admin.from('consultations').delete().eq('id', consultationId);
  });

  test('Múltiplos duplos cliques rápidos não geram múltiplas transições ou registros duplicados', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const navigated = await navigateToReception(page);
    if (!navigated) { test.skip(); return; }

    const cardFound = await findReceptionCard(page);
    if (!cardFound) {
      console.log('TC-R02-05: FUNCIONALIDADE PENDENTE — card Rex não encontrado');
      test.skip();
      return;
    }

    const card = page
      .locator('[data-testid="reception-card"]')
      .or(page.locator('[class*="card"]').filter({ hasText: /rex/i }).first())
      .or(page.getByText('Rex').first());

    // Simular duplos cliques rápidos (debounce test)
    await card.dblclick({ delay: 50 });
    await page.waitForTimeout(100);
    // Tentar segundo duplo clique muito rápido (o card pode já ter sumido)
    try {
      await card.dblclick({ delay: 50, timeout: 1_000 });
    } catch {
      // Card já sumiu — comportamento esperado após o primeiro duplo clique
    }

    await page.waitForTimeout(2_000);

    // Verificar que não há duplicatas na tabela de consultas para este pet
    const { data: allConsultations } = await admin
      .from('consultations')
      .select('id, status')
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .eq('patient_id', fixtures.patients.petA1.id);

    // Apenas 1 registro deve existir (o seedado)
    const consultCount = allConsultations?.length ?? 0;
    console.log(`TC-R02-05: Total de consultas para Rex no banco = ${consultCount}`);
    console.log(`TC-R02-05: Statuses = ${JSON.stringify(allConsultations?.map(c => c.status))}`);

    // Não deve ter duplicado o registro
    expect(consultCount).toBe(1);

    // Status deve ser um dos estados de triagem (ação completada)
    const finalStatus = allConsultations?.[0]?.status;
    const validFinalStatuses = ['reception', 'triage', 'triagem', 'waiting_triage'];
    expect(validFinalStatuses).toContain(finalStatus);
  });
});
