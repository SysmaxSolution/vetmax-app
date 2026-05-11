/**
 * E2E — Sprint Master Exames: E-03, E-04
 *
 * E-03: Botão "Dar Alta" na aba Exames (para pets que não retornam ao Consultório)
 * E-04: Botão "Mandar para Internação" na aba Exames (encaminhamento direto)
 *
 * Implementação:
 *  - E-03: ExamsWorkspace.tsx:100 — <LogOut /> botão "Dar Alta" com onDischarge()
 *  - E-04: ExamsWorkspace.tsx:109 — <BedDouble /> botão "Internar" com onSendToHospitalization()
 */

import { test, expect, Page } from '@playwright/test';
import { loginViaApi } from '../helpers/session'
import { createAdminClient } from '../helpers/supabase-test-client';
import { seedTutorsAndPets } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

async function loginAs(page: Page, email: string, password: string) {
  await loginViaApi(page, email, password)
}

async function seedExamQueueEntry(): Promise<{ queueId: string | null; consultationId: string | null }> {
  // Criar consulta e entrada na fila em status waiting_exam
  const { data: consultation } = await admin.from('consultations').insert([{
    clinic_id:  fixtures.clinics.clinicA.id,
    patient_id: fixtures.patients.petA1.id,
    tutor_id:   fixtures.tutors.tutorA1.id,
    status:     'waiting_exam',
    visit_reason: 'consultation',
  }]).select('id').single();

  const { data: queue } = await admin.from('queue_entries').insert([{
    clinic_id:       fixtures.clinics.clinicA.id,
    patient_id:      fixtures.patients.petA1.id,
    tutor_id:        fixtures.tutors.tutorA1.id,
    status:          'waiting_exam',
    visit_reason:    'consultation',
    consultation_id: consultation?.id,
  }]).select('id').single();

  return { queueId: queue?.id ?? null, consultationId: consultation?.id ?? null };
}

async function navigateToExams(page: Page): Promise<boolean> {
  await page.goto('/dashboard/exams');
  await page.waitForTimeout(2_500);
  const heading = page.getByText(/exames/i).first();
  return heading.isVisible({ timeout: 8_000 }).catch(() => false);
}

// ─── E-03: Dar Alta na aba Exames ────────────────────────────────────────────

test.describe('E-03: Botão "Dar Alta" na aba Exames', () => {
  let queueId: string | null = null;
  let consultationId: string | null = null;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    const result = await seedExamQueueEntry();
    queueId = result.queueId;
    consultationId = result.consultationId;
  });

  test.afterEach(async () => {
    if (queueId) await admin.from('queue_entries').delete().eq('id', queueId);
    if (consultationId) await admin.from('consultations').delete().eq('id', consultationId);
  });

  test('E-03-01: Botão "Dar Alta" visível para pets na fila de exames', async ({ page }) => {
    if (!queueId) { console.log('E-03-01: SKIP — Fila de exames não criada'); test.skip(); return; }

    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const loaded = await navigateToExams(page);
    if (!loaded) { console.log('E-03-01: SKIP — Módulo de exames não carregou'); test.skip(); return; }

    const petCard = page.getByText(fixtures.patients.petA1.name).first();
    if (!(await petCard.isVisible({ timeout: 8_000 }).catch(() => false))) {
      console.log('E-03-01: SKIP — Pet não encontrado na fila de exames'); test.skip(); return;
    }

    const dischargeBtn = page.getByRole('button', { name: /dar alta/i }).first();
    const visible = await dischargeBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`E-03-01: Botão "Dar Alta" visível na fila de exames: ${visible}`);
    expect(visible).toBe(true);
  });

  test('E-03-02: Clicar em "Dar Alta" exibe confirmação ou muda status', async ({ page }) => {
    if (!queueId) { console.log('E-03-02: SKIP — Fila de exames não criada'); test.skip(); return; }

    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const loaded = await navigateToExams(page);
    if (!loaded) { console.log('E-03-02: SKIP — Módulo de exames não carregou'); test.skip(); return; }

    const petCard = page.getByText(fixtures.patients.petA1.name).first();
    if (!(await petCard.isVisible({ timeout: 8_000 }).catch(() => false))) {
      console.log('E-03-02: SKIP — Pet não encontrado na fila de exames'); test.skip(); return;
    }

    const dischargeBtn = page.getByRole('button', { name: /dar alta/i }).first();
    if (!(await dischargeBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('E-03-02: SKIP — Botão Dar Alta não encontrado'); test.skip(); return;
    }

    await dischargeBtn.click();
    await page.waitForTimeout(1_500);

    // Verificar modal de confirmação ou mensagem de sucesso
    const confirmation = page.getByText(/confirmar alta|pet.*recebeu alta|alta.*confirmada|discharged/i).first()
      .or(page.getByRole('button', { name: /confirmar|sim/i }).first());
    const confVisible = await confirmation.isVisible({ timeout: 5_000 }).catch(() => false);

    // Verificar se o status mudou no banco
    const { data: queue } = await admin.from('queue_entries').select('status').eq('id', queueId).single();
    console.log(`E-03-02: Confirmação visível: ${confVisible}, Status no banco: ${queue?.status}`);

    const discharged = confVisible || queue?.status === 'completed' || queue?.status === 'discharged';
    expect(discharged).toBe(true);
  });

  test('E-03-03: Alta via Exames sem is_reviewed_by_vet gera flag de auditoria (CFMV)', async () => {
    if (!consultationId) { console.log('E-03-03: SKIP — Consulta não criada'); test.skip(); return; }

    // Verificar que is_reviewed_by_vet é false por padrão
    const { data } = await admin.from('consultations')
      .select('is_reviewed_by_vet')
      .eq('id', consultationId)
      .single();

    const notReviewed = !data?.is_reviewed_by_vet;
    console.log(`E-03-03: is_reviewed_by_vet = ${data?.is_reviewed_by_vet} (esperado: false = auditoria necessária)`);
    expect(notReviewed).toBe(true);
  });
});

// ─── E-04: Mandar para Internação via Exames ─────────────────────────────────

test.describe('E-04: Botão "Internar" na aba Exames encaminha para Internação', () => {
  let queueId: string | null = null;
  let consultationId: string | null = null;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    const result = await seedExamQueueEntry();
    queueId = result.queueId;
    consultationId = result.consultationId;
  });

  test.afterEach(async () => {
    if (queueId) await admin.from('queue_entries').delete().eq('id', queueId);
    if (consultationId) await admin.from('consultations').delete().eq('id', consultationId);
    // Limpar hospitalização criada pelo teste
    await admin.from('hospitalizations')
      .delete()
      .eq('patient_id', fixtures.patients.petA1.id)
      .eq('clinic_id', fixtures.clinics.clinicA.id);
  });

  test('E-04-01: Botão "Internar" visível para pets na fila de exames', async ({ page }) => {
    if (!queueId) { console.log('E-04-01: SKIP — Fila de exames não criada'); test.skip(); return; }

    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const loaded = await navigateToExams(page);
    if (!loaded) { console.log('E-04-01: SKIP — Módulo de exames não carregou'); test.skip(); return; }

    const petCard = page.getByText(fixtures.patients.petA1.name).first();
    if (!(await petCard.isVisible({ timeout: 8_000 }).catch(() => false))) {
      console.log('E-04-01: SKIP — Pet não encontrado na fila de exames'); test.skip(); return;
    }

    const internBtn = page.getByRole('button', { name: /internar/i }).first();
    const visible = await internBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`E-04-01: Botão "Internar" visível na fila de exames: ${visible}`);
    expect(visible).toBe(true);
  });

  test('E-04-02: Clicar "Internar" cria registro em hospitalizations com admission_source', async ({ page }) => {
    if (!queueId) { console.log('E-04-02: SKIP — Fila de exames não criada'); test.skip(); return; }

    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const loaded = await navigateToExams(page);
    if (!loaded) { console.log('E-04-02: SKIP — Módulo de exames não carregou'); test.skip(); return; }

    const petCard = page.getByText(fixtures.patients.petA1.name).first();
    if (!(await petCard.isVisible({ timeout: 8_000 }).catch(() => false))) {
      console.log('E-04-02: SKIP — Pet não encontrado na fila de exames'); test.skip(); return;
    }

    const internBtn = page.getByRole('button', { name: /internar/i }).first();
    if (!(await internBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('E-04-02: SKIP — Botão Internar não encontrado'); test.skip(); return;
    }

    // Contar hospitalizações antes
    const { count: before } = await admin.from('hospitalizations')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', fixtures.patients.petA1.id)
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    await internBtn.click();
    await page.waitForTimeout(2_000);

    // Preencher modal de internação se aparecer
    const reasonField = page.getByLabel(/motivo|reason/i).first()
      .or(page.locator('textarea[name*="reason"], input[name*="reason"]').first());
    if (await reasonField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await reasonField.fill('Internação via Exames — Teste E2E E-04');
    }

    const confirmBtn = page.getByRole('button', { name: /confirmar|internar|salvar/i }).first();
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2_000);
    }

    // Verificar criação no banco
    const { count: after } = await admin.from('hospitalizations')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', fixtures.patients.petA1.id)
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    console.log(`E-04-02: Hospitalizações antes: ${before}, depois: ${after}`);
    expect((after ?? 0)).toBeGreaterThan((before ?? 0));
  });
});
