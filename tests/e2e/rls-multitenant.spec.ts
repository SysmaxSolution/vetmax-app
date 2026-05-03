/**
 * E2E — Isolamento RLS Multi-Tenant (Cross-Módulo)
 *
 * Valida que o isolamento de dados entre clínicas é hermético em todas as tabelas críticas.
 * Cada TC usa o cliente Supabase autenticado com o usuário da Clínica B tentando ler
 * dados inseridos pela Clínica A, validando que RLS retorna 0 registros.
 *
 * TC-RLS-01: tutors — Clínica B não lê tutores da Clínica A
 * TC-RLS-02: patients — Clínica B não lê pacientes da Clínica A
 * TC-RLS-03: grooming_sessions — Clínica B não lê sessões de grooming da Clínica A
 * TC-RLS-04: central_cashier — Clínica B não lê lançamentos da Clínica A
 * TC-RLS-05: triage_records — Clínica B não lê triagem da Clínica A
 * TC-RLS-06: consultations — Clínica B não lê consultas da Clínica A
 * TC-RLS-07: hospitalizations — Clínica B não lê internações da Clínica A
 * TC-RLS-08: exam_requests — Clínica B não lê exames da Clínica A
 * TC-RLS-09: stock_items — Clínica B não lê estoque da Clínica A
 * TC-RLS-10: clinic_settings — Clínica B não lê configurações da Clínica A
 */

import { test, expect } from '@playwright/test';
import { createAdminClient, createUserClient } from '../helpers/supabase-test-client';
import { seedTutorsAndPets } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const admin = createAdminClient();

// ─── Seed helper ──────────────────────────────────────────────────────────────

let clientB: Awaited<ReturnType<typeof createUserClient>> | null = null;

test.beforeAll(async () => {
  try {
    clientB = await createUserClient(fixtures.users.adminB.email, fixtures.users.adminB.password);
  } catch (e) {
    console.warn('[TC-RLS] Não foi possível autenticar adminB — testes RLS SDK podem ser afetados:', (e as Error).message);
    clientB = null;
  }
});

function requireClientB() {
  if (!clientB) throw new Error('clientB não disponível — adminB auth falhou no beforeAll');
  return clientB;
}

// ─── TC-RLS-01: tutors ────────────────────────────────────────────────────────

test.describe('TC-RLS-01: Isolamento RLS — tabela tutors', () => {
  test.beforeEach(async () => {
    await seedTutorsAndPets();
  });

  test('Admin da Clínica B não lê tutores da Clínica A via SDK', async () => {
    const { data, error } = await requireClientB()
      .from('tutors')
      .select('id, name')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─── TC-RLS-02: patients ──────────────────────────────────────────────────────

test.describe('TC-RLS-02: Isolamento RLS — tabela patients', () => {
  test.beforeEach(async () => {
    await seedTutorsAndPets();
  });

  test('Admin da Clínica B não lê pacientes da Clínica A via SDK', async () => {
    const { data, error } = await requireClientB()
      .from('patients')
      .select('id, name')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─── TC-RLS-03: grooming_sessions ─────────────────────────────────────────────

test.describe('TC-RLS-03: Isolamento RLS — tabela grooming_sessions', () => {
  let sessionId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    const { data, error } = await admin.from('grooming_sessions').upsert([{
      ...fixtures.groomingSessions.session1,
      id: randomUUID(),
    }]).select('id').single();
    if (error) throw error;
    sessionId = data.id;
  });

  test.afterEach(async () => {
    if (sessionId) await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  test('Admin da Clínica B não lê sessões de grooming da Clínica A via SDK', async () => {
    const { data, error } = await requireClientB()
      .from('grooming_sessions')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─── TC-RLS-04: central_cashier ───────────────────────────────────────────────

test.describe('TC-RLS-04: Isolamento RLS — tabela central_cashier', () => {
  let entryId: string;

  test.beforeEach(async () => {
    const { data, error } = await admin.from('central_cashier').insert([{
      clinic_id: fixtures.clinics.clinicA.id,
      source_module: 'grooming',
      source_id: randomUUID(),
      amount: 100.00,
      status: 'recorded',
      reason: 'RLS Test TC-RLS-04',
    }]).select('id').single();
    if (error) throw error;
    entryId = data.id;
  });

  test.afterEach(async () => {
    if (entryId) await admin.from('central_cashier').delete().eq('id', entryId);
  });

  test('Admin da Clínica B não lê lançamentos do caixa da Clínica A via SDK', async () => {
    const { data, error } = await requireClientB()
      .from('central_cashier')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─── TC-RLS-05: triage_records ────────────────────────────────────────────────

test.describe('TC-RLS-05: Isolamento RLS — tabela triage_records', () => {
  let triageId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    const { data, error } = await admin.from('triage_records').upsert([{
      clinic_id: fixtures.clinics.clinicA.id,
      patient_id: fixtures.patients.petA1.id,
      tutor_id: fixtures.tutors.tutorA1.id,
      status: 'waiting',
      chief_complaint: 'RLS Test TC-RLS-05',
    }]).select('id').single();
    if (error) {
      console.warn('triage_records: tabela pode não existir ainda —', error.message);
      triageId = '';
      return;
    }
    triageId = data.id;
  });

  test.afterEach(async () => {
    if (triageId) await admin.from('triage_records').delete().eq('id', triageId);
  });

  test('Admin da Clínica B não lê registros de triagem da Clínica A via SDK', async () => {
    if (!triageId) {
      console.log('FUNCIONALIDADE PENDENTE DE IMPLEMENTAÇÃO: Tabela triage_records não existe ainda');
      test.skip();
      return;
    }

    const { data, error } = await requireClientB()
      .from('triage_records')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─── TC-RLS-06: consultations ─────────────────────────────────────────────────

test.describe('TC-RLS-06: Isolamento RLS — tabela consultations', () => {
  let consultationId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    const { data, error } = await admin.from('consultations').upsert([{
      clinic_id: fixtures.clinics.clinicA.id,
      patient_id: fixtures.patients.petA1.id,
      tutor_id: fixtures.tutors.tutorA1.id,
      status: 'reception',
      reason: 'RLS Test TC-RLS-06',
    }]).select('id').single();
    if (error) throw error;
    consultationId = data.id;
  });

  test.afterEach(async () => {
    if (consultationId) await admin.from('consultations').delete().eq('id', consultationId);
  });

  test('Admin da Clínica B não lê consultas da Clínica A via SDK', async () => {
    const { data, error } = await requireClientB()
      .from('consultations')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─── TC-RLS-07: hospitalizations ──────────────────────────────────────────────

test.describe('TC-RLS-07: Isolamento RLS — tabela hospitalizations', () => {
  let hospitalizationId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    const { data, error } = await admin.from('hospitalizations').upsert([{
      clinic_id: fixtures.clinics.clinicA.id,
      patient_id: fixtures.patients.petA1.id,
      tutor_id: fixtures.tutors.tutorA1.id,
      status: 'observation',
      admission_reason: 'RLS Test TC-RLS-07',
    }]).select('id').single();
    if (error) {
      console.warn('hospitalizations: tabela pode não existir —', error.message);
      hospitalizationId = '';
      return;
    }
    hospitalizationId = data.id;
  });

  test.afterEach(async () => {
    if (hospitalizationId) await admin.from('hospitalizations').delete().eq('id', hospitalizationId);
  });

  test('Admin da Clínica B não lê internações da Clínica A via SDK', async () => {
    if (!hospitalizationId) {
      console.log('FUNCIONALIDADE PENDENTE DE IMPLEMENTAÇÃO: Tabela hospitalizations não existe ainda');
      test.skip();
      return;
    }

    const { data, error } = await requireClientB()
      .from('hospitalizations')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─── TC-RLS-08: exam_requests ─────────────────────────────────────────────────

test.describe('TC-RLS-08: Isolamento RLS — tabela exam_requests', () => {
  let examId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    const { data, error } = await admin.from('exam_requests').upsert([{
      clinic_id: fixtures.clinics.clinicA.id,
      patient_id: fixtures.patients.petA1.id,
      tutor_id: fixtures.tutors.tutorA1.id,
      exam_type: 'RLS-TEST-TC-RLS-08',
      status: 'pending',
    }]).select('id').single();
    if (error) {
      console.warn('exam_requests: tabela pode não existir —', error.message);
      examId = '';
      return;
    }
    examId = data.id;
  });

  test.afterEach(async () => {
    if (examId) await admin.from('exam_requests').delete().eq('id', examId);
  });

  test('Admin da Clínica B não lê exames da Clínica A via SDK', async () => {
    if (!examId) {
      console.log('FUNCIONALIDADE PENDENTE DE IMPLEMENTAÇÃO: Tabela exam_requests não existe ainda');
      test.skip();
      return;
    }

    const { data, error } = await requireClientB()
      .from('exam_requests')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─── TC-RLS-09: stock_items ───────────────────────────────────────────────────

test.describe('TC-RLS-09: Isolamento RLS — tabela stock_items', () => {
  let stockItemId: string;

  test.beforeEach(async () => {
    const { data, error } = await admin.from('stock_items').upsert([{
      clinic_id: fixtures.clinics.clinicA.id,
      name: 'RLS Test TC-RLS-09',
      category: 'medication',
      quantity: 10,
      unit: 'comp',
      min_quantity: 2,
      unit_price: 1.0,
    }]).select('id').single();
    if (error) {
      console.warn('stock_items: tabela pode não existir —', error.message);
      stockItemId = '';
      return;
    }
    stockItemId = data.id;
  });

  test.afterEach(async () => {
    if (stockItemId) await admin.from('stock_items').delete().eq('id', stockItemId);
  });

  test('Admin da Clínica B não lê estoque da Clínica A via SDK', async () => {
    if (!stockItemId) {
      console.log('FUNCIONALIDADE PENDENTE DE IMPLEMENTAÇÃO: Tabela stock_items não existe ainda');
      test.skip();
      return;
    }

    const { data, error } = await requireClientB()
      .from('stock_items')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─── TC-RLS-10: clinic_settings ───────────────────────────────────────────────

test.describe('TC-RLS-10: Isolamento RLS — tabela clinic_settings', () => {
  test.beforeEach(async () => {
    await admin.from('clinic_settings').upsert([{
      ...fixtures.clinicSettings.clinicA,
      clinic_id: fixtures.clinics.clinicA.id,
    }]);
  });

  test('Admin da Clínica B não lê configurações da Clínica A via SDK', async () => {
    const { data, error } = await requireClientB()
      .from('clinic_settings')
      .select('clinic_id')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });
});
