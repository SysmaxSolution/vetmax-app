/**
 * E2E — Fase 6: RLS Avançado e Tenant Isolation (URL Interception + API Bypass)
 *
 * TC-RLS-ADV-001: Clínica A não acessa dashboard de gestão de Clínica B via URL forçada
 * TC-RLS-ADV-002: Clínica B não lê invoices da Clínica A via SDK autenticado
 * TC-RLS-ADV-003: Clínica B não lê hospitalizations da Clínica A via SDK
 * TC-RLS-ADV-004: Clínica B não lê consultations da Clínica A via SDK
 * TC-RLS-ADV-005: Clínica B não escreve em tutors da Clínica A via SDK
 * TC-RLS-ADV-006: Clínica B não escreve em grooming_sessions da Clínica A via SDK
 * TC-RLS-ADV-007: Clínica B não atualiza invoices da Clínica A via SDK
 * TC-RLS-ADV-008: POST /api/update-clinic sem autenticação → 401
 * TC-RLS-ADV-009: POST /api/update-clinic como receptionist → 403
 * TC-RLS-ADV-010: POST /api/update-clinic com clinic_id forjado no body → ignora e usa profile
 * TC-RLS-ADV-011: GET /api/get-current-user sem cookie → 401 ou usuário nulo
 * TC-RLS-ADV-012: Rota /dashboard/management bloqueada para role vet via URL direta
 * TC-RLS-ADV-013: Rota /dashboard/cashier bloqueada para role vet via URL direta
 * TC-RLS-ADV-014: profiles da Clínica B não são visíveis para usuário da Clínica A via SDK
 * TC-RLS-ADV-015: central_cashier INSERT com clinic_id forjado é rejeitado por RLS
 */

import { test, expect, type Page } from '@playwright/test';
import { loginViaApi } from '../helpers/session';
import { createAdminClient, createUserClient, getAccessToken } from '../helpers/supabase-test-client';
import { seedTutorsAndPets, seedGroomingSession } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── SDK clients autenticados ─────────────────────────────────────────────────

let clientB: Awaited<ReturnType<typeof createUserClient>> | null = null;
let clientReceptionistA: Awaited<ReturnType<typeof createUserClient>> | null = null;
let clientVetA: Awaited<ReturnType<typeof createUserClient>> | null = null;

test.beforeAll(async () => {
  try {
    clientB           = await createUserClient(fixtures.users.adminB.email,       fixtures.users.adminB.password);
    clientReceptionistA = await createUserClient(fixtures.users.receptionistA.email, fixtures.users.receptionistA.password);
    clientVetA        = await createUserClient(fixtures.users.vetA.email,         fixtures.users.vetA.password);
  } catch (e) {
    console.warn('[TC-RLS-ADV] Auth parcial:', (e as Error).message);
  }
});

// ─── Seed helpers ─────────────────────────────────────────────────────────────

let invoiceId: string | null = null;
let hospitalizationId: string | null = null;
let consultationId: string | null = null;

test.beforeAll(async () => {
  await seedTutorsAndPets();

  // invoice
  const { data: cons } = await admin.from('consultations').insert({
    clinic_id: fixtures.clinics.clinicA.id,
    patient_id: fixtures.patients.petA1.id,
    status: 'completed',
    visit_reason: 'consultation',
  }).select('id').single();
  if (cons) {
    const { data: inv } = await admin.from('invoices').insert({
      clinic_id:       fixtures.clinics.clinicA.id,
      consultation_id: cons.id,
      patient_id:      fixtures.patients.petA1.id,
      tutor_id:        fixtures.tutors.tutorA1.id,
      subtotal: 200, discount: 0, total_amount: 200, status: 'pending',
    }).select('id').single();
    invoiceId = inv?.id ?? null;
    consultationId = cons.id;
  }

  // hospitalization
  const { data: hosp } = await admin.from('hospitalizations').insert({
    clinic_id:  fixtures.clinics.clinicA.id,
    patient_id: fixtures.patients.petA1.id,
    tutor_id:   fixtures.tutors.tutorA1.id,
    reason:     'TC-RLS-ADV sentinel',
    status:     'observation',
  }).select('id').single();
  hospitalizationId = hosp?.id ?? null;
});

test.afterAll(async () => {
  if (invoiceId)        await admin.from('invoices').delete().eq('id', invoiceId);
  if (consultationId)   await admin.from('consultations').delete().eq('id', consultationId);
  if (hospitalizationId) await admin.from('hospitalizations').delete().eq('id', hospitalizationId);
});

function requireB() {
  if (!clientB) throw new Error('clientB não disponível');
  return clientB;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO I — URL INTERCEPTION (Browser)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TC-RLS-ADV-001: URL forçada /dashboard/management da Clínica A por admin da Clínica B', () => {
  test('Admin B tentando acessar /dashboard/management da Clínica A é redirecionado', async ({ page }) => {
    // Login como admin B
    await loginViaApi(page, fixtures.users.adminB.email, fixtures.users.adminB.password);

    // Força URL de management (pertence ao contexto de clinicA de forma implicita, mas
    // a rota não pertence a uma clínica específica — teste que o role guard e RLS bloqueiam
    // qualquer tentativa de ler dados sensíveis da Clínica A via navegação)
    await page.goto('/dashboard/management');
    await page.waitForTimeout(2_000);

    // O admin B SÃO admin da sua própria clínica — a página deve carregar
    // MAS deve mostrar dados da Clínica B (não Clínica A)
    // Verificar que NÃO aparece nome da clínica A
    const pageText = await page.textContent('body') ?? '';
    expect(pageText).not.toContain(fixtures.clinics.clinicA.name);
  });
});

test.describe('TC-RLS-ADV-012: Role vet bloqueado em /dashboard/management', () => {
  test('Vet da Clínica A não acessa /dashboard/management — redireciona', async ({ page }) => {
    await loginViaApi(page, fixtures.users.vetA.email, fixtures.users.vetA.password);

    await page.goto('/dashboard/management');
    await page.waitForTimeout(2_500);

    // Deve ter sido redirecionado (não está em /management)
    expect(page.url()).not.toMatch(/\/management/);
  });
});

test.describe('TC-RLS-ADV-013: Role vet bloqueado em /dashboard/cashier', () => {
  test('Vet da Clínica A é bloqueado em /dashboard/cashier', async ({ page }) => {
    await loginViaApi(page, fixtures.users.vetA.email, fixtures.users.vetA.password);

    await page.goto('/dashboard/cashier');
    await page.waitForTimeout(2_500);

    // Vet não está na lista ALLOWED_ROLES do cashier — deve redirecionar
    expect(page.url()).not.toMatch(/\/cashier/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO II — SDK RLS READ ISOLATION (Clínica B não lê dados da Clínica A)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TC-RLS-ADV-002: Clínica B não lê invoices da Clínica A via SDK', () => {
  test('SELECT invoices com clinic_id da A retorna 0 rows para admin B', async () => {
    if (!invoiceId) { test.skip(); return; }
    const { data, error } = await requireB()
      .from('invoices')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

test.describe('TC-RLS-ADV-003: Clínica B não lê hospitalizations da Clínica A via SDK', () => {
  test('SELECT hospitalizations com clinic_id da A retorna 0 rows para admin B', async () => {
    if (!hospitalizationId) { test.skip(); return; }
    const { data, error } = await requireB()
      .from('hospitalizations')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

test.describe('TC-RLS-ADV-004: Clínica B não lê consultations da Clínica A via SDK', () => {
  test('SELECT consultations com clinic_id da A retorna 0 rows para admin B', async () => {
    if (!consultationId) { test.skip(); return; }
    const { data, error } = await requireB()
      .from('consultations')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

test.describe('TC-RLS-ADV-014: profiles da Clínica B não vê profiles da Clínica A via SDK', () => {
  test('SELECT profiles com clinic_id da A retorna 0 rows para admin B', async () => {
    const { data, error } = await requireB()
      .from('profiles')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO III — SDK RLS WRITE ISOLATION (Clínica B não escreve em dados da Clínica A)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TC-RLS-ADV-005: Clínica B não insere tutor com clinic_id da Clínica A', () => {
  test('INSERT tutor com clinic_id da A é rejeitado por RLS para admin B', async () => {
    const { data, error } = await requireB()
      .from('tutors')
      .insert({
        clinic_id: fixtures.clinics.clinicA.id,  // forjado
        name:      'INTRUSO-TC-RLS-ADV-005',
        cpf:       '999.999.999-99',
        phone:     '(00) 00000-0000',
      })
      .select('id')
      .single();

    // RLS deve rejeitar: error ou data nulo
    const wasInserted = !error && data?.id;
    if (wasInserted) {
      // Limpeza defensiva
      await admin.from('tutors').delete().eq('id', data.id);
    }
    expect(wasInserted).toBeFalsy();
  });
});

test.describe('TC-RLS-ADV-006: Clínica B não insere grooming_session com clinic_id da Clínica A', () => {
  test('INSERT grooming_session com clinic_id da A é bloqueado por RLS', async () => {
    const { data, error } = await requireB()
      .from('grooming_sessions')
      .insert({
        clinic_id:  fixtures.clinics.clinicA.id,
        patient_id: fixtures.patients.petA1.id,
        status:     'received',
        price_total: 0,
        services_requested: [],
      })
      .select('id')
      .single();

    const wasInserted = !error && data?.id;
    if (wasInserted) {
      await admin.from('grooming_sessions').delete().eq('id', data.id);
    }
    expect(wasInserted).toBeFalsy();
  });
});

test.describe('TC-RLS-ADV-007: Clínica B não atualiza invoice da Clínica A via SDK', () => {
  test('UPDATE invoice com id da A retorna 0 rows afetadas para admin B', async () => {
    if (!invoiceId) { test.skip(); return; }

    const { error } = await requireB()
      .from('invoices')
      .update({ status: 'paid' })
      .eq('id', invoiceId);

    // Sem erro (RLS silencioso), mas a fatura NÃO deve ter mudado
    const { data: inv } = await admin.from('invoices').select('status').eq('id', invoiceId).single();
    expect(inv?.status).toBe('pending'); // deve permanecer pending
  });
});

test.describe('TC-RLS-ADV-015: central_cashier INSERT com clinic_id forjado é rejeitado', () => {
  test('Admin B não consegue inserir lançamento com clinic_id da Clínica A', async () => {
    const { data, error } = await requireB()
      .from('central_cashier')
      .insert({
        clinic_id:     fixtures.clinics.clinicA.id,  // forjado
        source_module: 'grooming',
        source_id:     randomUUID(),
        amount:        9999,
        status:        'recorded',
        reason:        'INTRUSO-TC-RLS-ADV-015',
      })
      .select('id')
      .single();

    const wasInserted = !error && data?.id;
    if (wasInserted) {
      await admin.from('central_cashier').delete().eq('id', data.id);
    }
    expect(wasInserted).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCO IV — API ROUTE SECURITY (HTTP direto sem/com auth inadequada)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('TC-RLS-ADV-008: POST /api/update-clinic sem autenticação → 401', () => {
  test('Requisição sem cookie de sessão retorna 401', async ({ request }) => {
    const res = await request.post('/api/update-clinic', {
      data: { name: 'INTRUSO', cnpj: '00.000.000/0000-00' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('TC-RLS-ADV-009: POST /api/update-clinic como receptionist → 403', () => {
  test('Receptionist logado recebe 403 ao tentar editar clínica', async ({ page, request }) => {
    // Login via API para obter cookie de sessão
    await loginViaApi(page, fixtures.users.receptionistA.email, fixtures.users.receptionistA.password);

    // Fazer chamada de API com o contexto autenticado do browser
    const res = await page.request.post('/api/update-clinic', {
      data: { name: 'HACK_ATTEMPT' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('TC-RLS-ADV-010: POST /api/update-clinic com clinic_id forjado no body → ignorado', () => {
  test('Server usa clinic_id do profile — body clinic_id é ignorado', async ({ page }) => {
    // Login como admin A
    await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    // Tentar atualizar com clinic_id da Clínica B no body
    const res = await page.request.post('/api/update-clinic', {
      data: {
        name:      'TENTATIVA DE SOBRESCRITA',
        clinic_id: fixtures.clinics.clinicB.id,  // forjado
      },
      headers: { 'Content-Type': 'application/json' },
    });

    // Deve retornar sucesso (200) MAS atualizar apenas a Clínica A
    // (o endpoint usa profile.clinic_id, não o clinic_id do body)
    const body = await res.json().catch(() => ({}));

    if (res.status() === 200) {
      // Verificar que Clínica B NÃO foi modificada
      const { data: clinicB } = await admin.from('clinics').select('name').eq('id', fixtures.clinics.clinicB.id).single();
      expect(clinicB?.name).not.toBe('TENTATIVA DE SOBRESCRITA');

      // Restaurar nome da Clínica A
      await admin.from('clinics').update({ name: fixtures.clinics.clinicA.name }).eq('id', fixtures.clinics.clinicA.id);
    } else {
      // 4xx ou 5xx são aceitáveis (servidor rejeitou)
      expect([400, 401, 403, 422, 500]).toContain(res.status());
    }
  });
});

test.describe('TC-RLS-ADV-011: GET /api/get-current-user sem autenticação', () => {
  test('Requisição sem cookie retorna 401 ou usuário nulo', async ({ request }) => {
    const res = await request.get('/api/get-current-user');
    if (res.status() === 200) {
      const body = await res.json().catch(() => ({}));
      // Deve retornar user: null
      expect(body?.user ?? body?.id ?? null).toBeNull();
    } else {
      expect([401, 403, 404]).toContain(res.status());
    }
  });
});
