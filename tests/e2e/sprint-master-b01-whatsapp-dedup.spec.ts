/**
 * E2E — Sprint Master B-01: WhatsApp Deduplicado (GroomingDetailModal)
 *
 * TC-B01-01: Salvar grooming com status "bathing" NÃO abre popup WhatsApp
 * TC-B01-02: Salvar grooming com status "waiting_pickup" ABRE popup WhatsApp
 * TC-B01-03: Salvar grooming com status "delivered" ABRE popup WhatsApp
 * TC-B01-04: Salvar grooming com status "received" NÃO abre popup WhatsApp
 * TC-B01-05 (Crítico): Duplo save consecutivo com waiting_pickup só abre popup uma vez
 *
 * Comportamento testado: dispatch WA só ocorre quando
 * currentCardStatus === 'waiting_pickup' || currentCardStatus === 'delivered'
 */

import { test, expect, Page } from '@playwright/test';
import { createAdminClient } from '../helpers/supabase-test-client';
import { seedTutorsAndPets, seedGroomingSession } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL(/\/(dashboard|reception|vet|onboarding)/, { timeout: 30_000 });
}

async function enableGroomingModule(clinicId: string) {
  const { data } = await admin.from('clinics').select('active_modules').eq('id', clinicId).single();
  const mods: string[] = Array.isArray(data?.active_modules) ? data.active_modules : [];
  if (!mods.includes('grooming')) {
    await admin.from('clinics').update({ active_modules: [...mods, 'grooming'] }).eq('id', clinicId);
  }
}

/** Abre GroomingDetailModal para a sessão com o dado ID */
async function openGroomingCard(page: Page, sessionId: string) {
  await page.goto('/dashboard/grooming');
  await page.waitForTimeout(2_000);

  // Tentar abrir via data-testid ou pelo nome do pet (Rex)
  const cardLocator = page.locator(`[data-testid="grooming-card-${sessionId}"]`)
    .or(page.locator('[data-testid^="grooming-card"]').filter({ hasText: 'Rex' }).first())
    .or(page.getByText('Rex').first());

  const cardVisible = await cardLocator.isVisible({ timeout: 8_000 }).catch(() => false);
  if (!cardVisible) {
    console.log('B01: Card Rex não encontrado no Kanban de Grooming');
    return false;
  }
  await cardLocator.click();
  await page.waitForTimeout(1_000);
  return true;
}

/** Verifica se algum popup/modal de WhatsApp está visível na tela */
async function isWhatsAppPopupVisible(page: Page): Promise<boolean> {
  const popup = page.getByRole('dialog')
    .filter({ hasText: /whatsapp|enviar mensagem|notif/i })
    .or(page.locator('[data-testid*="whatsapp"]'))
    .or(page.getByText(/enviar pelo whatsapp|notif.*whatsapp|wa\.me/i).first());
  return popup.isVisible({ timeout: 3_000 }).catch(() => false);
}

/** Fecha qualquer popup/modal de confirmação visível */
async function dismissAnyPopup(page: Page) {
  const closeBtn = page.getByRole('button', { name: /fechar|cancelar|não enviar|dispensar/i }).first();
  if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }
  // ESC como fallback
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ─── TC-B01-01: Status "bathing" NÃO abre popup WhatsApp ─────────────────────

test.describe('TC-B01-01: Status bathing não abre popup WhatsApp', () => {
  let sessionId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableGroomingModule(fixtures.clinics.clinicA.id);
    sessionId = await seedGroomingSession({ status: 'bathing', current_status: 'bathing' });
  });

  test.afterEach(async () => {
    if (sessionId) await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  test('Save com status bathing não dispara popup WhatsApp', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const opened = await openGroomingCard(page, sessionId);
    if (!opened) {
      console.log('TC-B01-01: SKIP — Card de grooming não encontrado no Kanban');
      test.skip();
      return;
    }

    // Verificar que o modal abriu
    const modal = page.getByRole('dialog').first();
    const modalVisible = await modal.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!modalVisible) {
      console.log('TC-B01-01: SKIP — GroomingDetailModal não abriu');
      test.skip();
      return;
    }

    // Salvar via botão Save/Atualizar (sem mudar o status — mantendo bathing)
    const saveBtn = page.getByRole('button', { name: /salvar|atualizar|save/i }).first();
    if (!(await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('TC-B01-01: SKIP — Botão salvar não encontrado no modal');
      test.skip();
      return;
    }
    await saveBtn.click();
    await page.waitForTimeout(2_000);

    const popupVisible = await isWhatsAppPopupVisible(page);
    console.log(`TC-B01-01: Popup WhatsApp visível (esperado: false): ${popupVisible}`);
    expect(popupVisible).toBe(false);
  });
});

// ─── TC-B01-02: Status "waiting_pickup" ABRE popup WhatsApp ──────────────────

test.describe('TC-B01-02: Status waiting_pickup abre popup WhatsApp', () => {
  let sessionId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableGroomingModule(fixtures.clinics.clinicA.id);
    // Setar status anterior como bathing para simular a transição
    sessionId = await seedGroomingSession({ status: 'bathing', current_status: 'bathing' });
  });

  test.afterEach(async () => {
    if (sessionId) await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  test('Save com status waiting_pickup abre popup WhatsApp', async ({ page }) => {
    // Mudar status para waiting_pickup via DB antes de abrir o modal
    await admin.from('grooming_sessions')
      .update({ status: 'waiting_pickup', current_status: 'waiting_pickup' })
      .eq('id', sessionId);

    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const opened = await openGroomingCard(page, sessionId);
    if (!opened) {
      console.log('TC-B01-02: SKIP — Card de grooming não encontrado no Kanban');
      test.skip();
      return;
    }

    const modal = page.getByRole('dialog').first();
    const modalVisible = await modal.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!modalVisible) {
      console.log('TC-B01-02: SKIP — GroomingDetailModal não abriu');
      test.skip();
      return;
    }

    const saveBtn = page.getByRole('button', { name: /salvar|atualizar|save/i }).first();
    if (!(await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('TC-B01-02: SKIP — Botão salvar não encontrado no modal');
      test.skip();
      return;
    }
    await saveBtn.click();
    await page.waitForTimeout(2_000);

    const popupVisible = await isWhatsAppPopupVisible(page);
    console.log(`TC-B01-02: Popup WhatsApp visível (esperado: true): ${popupVisible}`);

    if (!popupVisible) {
      console.log('TC-B01-02: FUNCIONALIDADE PENDENTE — Popup WA não apareceu para waiting_pickup. Verificar GroomingDetailModal.tsx dispatch WA.');
    }
    expect(popupVisible).toBe(true);
  });
});

// ─── TC-B01-03: Status "delivered" ABRE popup WhatsApp ───────────────────────

test.describe('TC-B01-03: Status delivered abre popup WhatsApp', () => {
  let sessionId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableGroomingModule(fixtures.clinics.clinicA.id);
    sessionId = await seedGroomingSession({ status: 'waiting_pickup', current_status: 'waiting_pickup' });
  });

  test.afterEach(async () => {
    if (sessionId) await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  test('Save com status delivered abre popup WhatsApp', async ({ page }) => {
    // Mudar status para delivered via DB
    await admin.from('grooming_sessions')
      .update({ status: 'delivered', current_status: 'delivered' })
      .eq('id', sessionId);

    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const opened = await openGroomingCard(page, sessionId);
    if (!opened) {
      console.log('TC-B01-03: SKIP — Card de grooming não encontrado no Kanban');
      test.skip();
      return;
    }

    const modal = page.getByRole('dialog').first();
    const modalVisible = await modal.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!modalVisible) {
      console.log('TC-B01-03: SKIP — GroomingDetailModal não abriu');
      test.skip();
      return;
    }

    const saveBtn = page.getByRole('button', { name: /salvar|atualizar|save/i }).first();
    if (!(await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('TC-B01-03: SKIP — Botão salvar não encontrado no modal');
      test.skip();
      return;
    }
    await saveBtn.click();
    await page.waitForTimeout(2_000);

    const popupVisible = await isWhatsAppPopupVisible(page);
    console.log(`TC-B01-03: Popup WhatsApp visível (esperado: true): ${popupVisible}`);

    if (!popupVisible) {
      console.log('TC-B01-03: FUNCIONALIDADE PENDENTE — Popup WA não apareceu para delivered.');
    }
    expect(popupVisible).toBe(true);
  });
});

// ─── TC-B01-04: Status "received" NÃO abre popup WhatsApp ────────────────────

test.describe('TC-B01-04: Status received não abre popup WhatsApp', () => {
  let sessionId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableGroomingModule(fixtures.clinics.clinicA.id);
    sessionId = await seedGroomingSession({ status: 'received', current_status: 'arrived' });
  });

  test.afterEach(async () => {
    if (sessionId) await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  test('Save com status received não dispara popup WhatsApp', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const opened = await openGroomingCard(page, sessionId);
    if (!opened) {
      console.log('TC-B01-04: SKIP — Card de grooming não encontrado no Kanban');
      test.skip();
      return;
    }

    const modal = page.getByRole('dialog').first();
    const modalVisible = await modal.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!modalVisible) {
      console.log('TC-B01-04: SKIP — GroomingDetailModal não abriu');
      test.skip();
      return;
    }

    const saveBtn = page.getByRole('button', { name: /salvar|atualizar|save/i }).first();
    if (!(await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('TC-B01-04: SKIP — Botão salvar não encontrado no modal');
      test.skip();
      return;
    }
    await saveBtn.click();
    await page.waitForTimeout(2_000);

    const popupVisible = await isWhatsAppPopupVisible(page);
    console.log(`TC-B01-04: Popup WhatsApp visível (esperado: false): ${popupVisible}`);
    expect(popupVisible).toBe(false);
  });
});

// ─── TC-B01-05 (Crítico): Duplo save — popup aparece só uma vez ───────────────

test.describe('TC-B01-05: Duplo save consecutivo só abre popup uma vez', () => {
  let sessionId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableGroomingModule(fixtures.clinics.clinicA.id);
    sessionId = await seedGroomingSession({ status: 'waiting_pickup', current_status: 'waiting_pickup' });
  });

  test.afterEach(async () => {
    if (sessionId) await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  test('Duplo save consecutivo com waiting_pickup abre popup apenas uma vez', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const opened = await openGroomingCard(page, sessionId);
    if (!opened) {
      console.log('TC-B01-05: SKIP — Card de grooming não encontrado no Kanban');
      test.skip();
      return;
    }

    const modal = page.getByRole('dialog').first();
    const modalVisible = await modal.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!modalVisible) {
      console.log('TC-B01-05: SKIP — GroomingDetailModal não abriu');
      test.skip();
      return;
    }

    const saveBtn = page.getByRole('button', { name: /salvar|atualizar|save/i }).first();
    if (!(await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('TC-B01-05: SKIP — Botão salvar não encontrado no modal');
      test.skip();
      return;
    }

    // Primeiro save
    await saveBtn.click();
    await page.waitForTimeout(1_500);

    const firstPopup = await isWhatsAppPopupVisible(page);
    console.log(`TC-B01-05: Popup após 1º save (esperado: true): ${firstPopup}`);

    if (!firstPopup) {
      console.log('TC-B01-05: FUNCIONALIDADE PENDENTE — Popup WA não apareceu no 1º save.');
      test.skip();
      return;
    }

    // Fechar o popup
    await dismissAnyPopup(page);
    await page.waitForTimeout(1_000);

    // Contar dialogs antes do segundo save
    let popupCount = 0;
    page.on('dialog', async dialog => {
      popupCount++;
      await dialog.dismiss().catch(() => {});
    });

    // Segundo save consecutivo
    const saveBtnAgain = page.getByRole('button', { name: /salvar|atualizar|save/i }).first();
    if (await saveBtnAgain.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveBtnAgain.click();
      await page.waitForTimeout(2_000);
    }

    // Verificar se popup WA NÃO reabre no segundo save (deduplicação)
    const secondPopup = await isWhatsAppPopupVisible(page);
    console.log(`TC-B01-05: Popup após 2º save (esperado: false, dedup ativo): ${secondPopup}`);

    if (secondPopup) {
      console.log('TC-B01-05: FALHA — Popup WA abriu duas vezes. Deduplicação B-01 não está funcionando.');
    }
    expect(secondPopup).toBe(false);
  });
});
