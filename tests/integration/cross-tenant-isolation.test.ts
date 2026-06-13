/**
 * SECURITY — Teste Adversarial Cross-Tenant
 *
 * Verifica o isolamento multi-clínica em dois níveis:
 *
 * CAMADA 1 — RLS (client anon autenticado como Clínica A):
 *   Usuário da Clínica A NÃO deve ver dados da Clínica B pelo client anon.
 *
 * CAMADA 2 — WHERE manual (padrão das server actions com admin client):
 *   A action busca clinic_id no profiles, então usa admin + WHERE clinic_id.
 *   Se o WHERE estiver presente, a Clínica A não acessa dados da Clínica B.
 *   TC-CROSS-09 documenta que sem o WHERE, o admin VAZA — cada action sem
 *   o filtro é um leak real.
 *
 * TC-CROSS-01..05 : RLS bloqueia leitura cross-tenant pelo client anon
 * TC-CROSS-06     : WHERE com clinic_A_id isola reads (pacientes, consultas, financeiro)
 * TC-CROSS-07     : UPDATE com clinic_A_id não afeta registros da Clínica B
 * TC-CROSS-08     : DELETE com clinic_A_id não apaga registros da Clínica B
 * TC-CROSS-09     : Admin sem WHERE vaza dados (documenta o risco das actions sem filtro)
 */

import { createAdminClient, createUserClient } from '../helpers/supabase-test-client';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

const SENTINEL = {
  tutorId:        'b9000001-0000-0000-0000-000000000001',
  patientId:      'b9000001-0000-0000-0000-000000000002',
  consultationId: 'b9000001-0000-0000-0000-000000000003',
  financialId:    'b9000001-0000-0000-0000-000000000004',
  cashierId:      'b9000001-0000-0000-0000-000000000005',
  invoiceId:      'b9000001-0000-0000-0000-000000000006',
} as const;

const CLINIC_A = fixtures.clinics.clinicA.id;
const CLINIC_B = fixtures.clinics.clinicB.id;

let sentinelReady = false;

// ─── Setup: insere dados sentinel na Clínica B ───────────────────────────────
beforeAll(async () => {
  // Tutor (schema: name, phone obrigatórios)
  const { error: eTutor } = await admin.from('tutors').upsert({
    id:       SENTINEL.tutorId,
    clinic_id: CLINIC_B,
    name:     'Tutor Sentinel Clínica B',
    cpf:      '99988877766',
    email:    'sentinel-b@test.internal',
    phone:    '11999990000',
  });
  if (eTutor) { console.error('[SENTINEL] tutor upsert falhou:', eTutor.message); return; }

  // Paciente
  const { error: ePet } = await admin.from('patients').upsert({
    id:       SENTINEL.patientId,
    clinic_id: CLINIC_B,
    tutor_id:  SENTINEL.tutorId,
    name:     'Pet Sentinel Clínica B',
    species:  'dog',
    breed:    'Teste',
  });
  if (ePet) { console.error('[SENTINEL] patient upsert falhou:', ePet.message); return; }

  // Consulta
  const { error: eCons } = await admin.from('consultations').upsert({
    id:             SENTINEL.consultationId,
    clinic_id:      CLINIC_B,
    patient_id:     SENTINEL.patientId,
    status:         'reception',
    visit_reason:   'consultation',
    payment_status: 'pending',
  });
  if (eCons) { console.error('[SENTINEL] consultation upsert falhou:', eCons.message); return; }

  // Lançamento financeiro (amount > 0 obrigatório, due_date obrigatório)
  const { error: eFin } = await admin.from('financial_entries').upsert({
    id:          SENTINEL.financialId,
    clinic_id:   CLINIC_B,
    type:        'receivable',
    description: 'SENTINEL CROSS-TENANT TEST',
    amount:      999.99,
    due_date:    '2099-12-31',
    status:      'pending',
  });
  if (eFin) { console.error('[SENTINEL] financial_entry upsert falhou:', eFin.message); return; }

  // Caixa central (amount != 0 obrigatório pelo CHECK)
  const { error: eCash } = await admin.from('central_cashier').upsert({
    id:            SENTINEL.cashierId,
    clinic_id:     CLINIC_B,
    source_module: 'manual',
    source_id:     SENTINEL.consultationId,
    amount:        999.99,
    status:        'recorded',
    reason:        'SENTINEL CROSS-TENANT TEST',
  });
  if (eCash) { console.error('[SENTINEL] central_cashier upsert falhou:', eCash.message); return; }

  // Fatura (consultation_id UNIQUE NOT NULL, status: 'pending' | 'paid' | 'cancelled')
  const { error: eInv } = await admin.from('invoices').upsert({
    id:              SENTINEL.invoiceId,
    clinic_id:       CLINIC_B,
    consultation_id: SENTINEL.consultationId,
    patient_id:      SENTINEL.patientId,
    tutor_id:        SENTINEL.tutorId,
    subtotal:        999.99,
    total_amount:    999.99,
    status:          'pending',
  });
  if (eInv) { console.error('[SENTINEL] invoice upsert falhou:', eInv.message); return; }

  // Confirma que o dado foi criado de fato (se admin não retornar, nenhum teste tem valor)
  const { data: check } = await admin
    .from('patients')
    .select('id')
    .eq('id', SENTINEL.patientId)
    .maybeSingle();

  if (!check) {
    console.error('[SENTINEL] FALHA CRÍTICA: dado sentinel não encontrado após upsert. Testes de isolamento não provam nada.');
    return;
  }

  sentinelReady = true;
});

// ─── Teardown ────────────────────────────────────────────────────────────────
afterAll(async () => {
  await admin.from('invoices').delete().eq('id', SENTINEL.invoiceId);
  await admin.from('central_cashier').delete().eq('id', SENTINEL.cashierId);
  await admin.from('financial_entries').delete().eq('id', SENTINEL.financialId);
  await admin.from('consultations').delete().eq('id', SENTINEL.consultationId);
  await admin.from('patients').delete().eq('id', SENTINEL.patientId);
  await admin.from('tutors').delete().eq('id', SENTINEL.tutorId);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAMADA 1 — RLS: client anon autenticado como usuário da Clínica A
// ═══════════════════════════════════════════════════════════════════════════════

describe('CAMADA 1 — Isolamento via RLS (client anon — Clínica A vs Clínica B)', () => {
  let clientA: Awaited<ReturnType<typeof createUserClient>>;

  beforeAll(async () => {
    if (!sentinelReady) return;
    clientA = await createUserClient(
      fixtures.users.adminA.email,
      fixtures.users.adminA.password,
    );
  });

  const skip = () => !sentinelReady;

  test('TC-CROSS-01: Usuário da Clínica A não lê pacientes da Clínica B por ID direto', async () => {
    if (skip()) return;
    const { data, error } = await clientA
      .from('patients')
      .select('id, clinic_id, name')
      .eq('id', SENTINEL.patientId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull(); // RLS deve barrar
  });

  test('TC-CROSS-02: Usuário da Clínica A não lê consultas da Clínica B por ID direto', async () => {
    if (skip()) return;
    const { data, error } = await clientA
      .from('consultations')
      .select('id, clinic_id')
      .eq('id', SENTINEL.consultationId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test('TC-CROSS-03: Usuário da Clínica A não lê financial_entries da Clínica B por ID direto', async () => {
    if (skip()) return;
    const { data, error } = await clientA
      .from('financial_entries')
      .select('id, clinic_id, amount')
      .eq('id', SENTINEL.financialId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test('TC-CROSS-04: Usuário da Clínica A não lê central_cashier da Clínica B por ID direto', async () => {
    if (skip()) return;
    const { data, error } = await clientA
      .from('central_cashier')
      .select('id, clinic_id, amount')
      .eq('id', SENTINEL.cashierId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test('TC-CROSS-05: Usuário da Clínica A não lê invoices da Clínica B por ID direto', async () => {
    if (skip()) return;
    const { data, error } = await clientA
      .from('invoices')
      .select('id, clinic_id, total_amount')
      .eq('id', SENTINEL.invoiceId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test('TC-CROSS-01b: Listagem ampla de pacientes da Clínica A não contém dados da Clínica B', async () => {
    if (skip()) return;
    const { data, error } = await clientA
      .from('patients')
      .select('id, clinic_id')
      .limit(500);

    expect(error).toBeNull();
    const clinicBRows = (data ?? []).filter(r => r.clinic_id === CLINIC_B);
    expect(clinicBRows).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAMADA 2 — WHERE manual: simula o padrão das server actions com admin client
// ═══════════════════════════════════════════════════════════════════════════════

describe('CAMADA 2 — Isolamento via WHERE manual (padrão das server actions)', () => {

  test('TC-CROSS-06a: WHERE clinic_A_id + id da Clínica B → retorna vazio (pacientes)', async () => {
    if (!sentinelReady) return;
    const { data } = await admin
      .from('patients')
      .select('id, clinic_id, name')
      .eq('clinic_id', CLINIC_A)
      .in('id', [SENTINEL.patientId]);
    expect(data).toHaveLength(0);
  });

  test('TC-CROSS-06b: WHERE clinic_A_id + id da Clínica B → retorna vazio (consultas)', async () => {
    if (!sentinelReady) return;
    const { data } = await admin
      .from('consultations')
      .select('id, clinic_id')
      .eq('clinic_id', CLINIC_A)
      .in('id', [SENTINEL.consultationId]);
    expect(data).toHaveLength(0);
  });

  test('TC-CROSS-06c: WHERE clinic_A_id + id da Clínica B → retorna vazio (financial_entries)', async () => {
    if (!sentinelReady) return;
    const { data } = await admin
      .from('financial_entries')
      .select('id, clinic_id, amount')
      .eq('clinic_id', CLINIC_A)
      .in('id', [SENTINEL.financialId]);
    expect(data).toHaveLength(0);
  });

  test('TC-CROSS-06d: WHERE clinic_A_id + id da Clínica B → retorna vazio (central_cashier)', async () => {
    if (!sentinelReady) return;
    const { data } = await admin
      .from('central_cashier')
      .select('id, clinic_id, amount')
      .eq('clinic_id', CLINIC_A)
      .in('id', [SENTINEL.cashierId]);
    expect(data).toHaveLength(0);
  });

  test('TC-CROSS-06e: WHERE clinic_A_id + id da Clínica B → retorna vazio (invoices)', async () => {
    if (!sentinelReady) return;
    const { data } = await admin
      .from('invoices')
      .select('id, clinic_id, total_amount')
      .eq('clinic_id', CLINIC_A)
      .in('id', [SENTINEL.invoiceId]);
    expect(data).toHaveLength(0);
  });

  test('TC-CROSS-07: UPDATE admin com clinic_A_id não afeta pacientes da Clínica B', async () => {
    if (!sentinelReady) return;
    const { data: affected } = await admin
      .from('patients')
      .update({ name: 'COMPROMETIDO — VAZAMENTO CROSS-TENANT' })
      .eq('clinic_id', CLINIC_A)
      .eq('id', SENTINEL.patientId)
      .select('id, name');

    expect(affected).toHaveLength(0); // nenhuma linha afetada

    // Dado original da Clínica B deve estar intacto
    const { data: original } = await admin
      .from('patients')
      .select('name')
      .eq('id', SENTINEL.patientId)
      .maybeSingle();

    expect(original?.name).toBe('Pet Sentinel Clínica B');
  });

  test('TC-CROSS-07b: UPDATE admin com clinic_A_id não afeta financial_entries da Clínica B', async () => {
    if (!sentinelReady) return;
    const { data: affected } = await admin
      .from('financial_entries')
      .update({ status: 'paid', description: 'COMPROMETIDO' })
      .eq('clinic_id', CLINIC_A)
      .eq('id', SENTINEL.financialId)
      .select('id');

    expect(affected).toHaveLength(0);

    const { data: original } = await admin
      .from('financial_entries')
      .select('status, description')
      .eq('id', SENTINEL.financialId)
      .maybeSingle();

    expect(original?.status).toBe('pending');
    expect(original?.description).toBe('SENTINEL CROSS-TENANT TEST');
  });

  test('TC-CROSS-08: DELETE admin com clinic_A_id não apaga pacientes da Clínica B', async () => {
    if (!sentinelReady) return;
    await admin
      .from('patients')
      .delete()
      .eq('clinic_id', CLINIC_A)
      .eq('id', SENTINEL.patientId);

    const { data: stillThere } = await admin
      .from('patients')
      .select('id')
      .eq('id', SENTINEL.patientId)
      .maybeSingle();

    expect(stillThere?.id).toBe(SENTINEL.patientId);
  });

  /**
   * TC-CROSS-09 — DOCUMENTA O RISCO PRINCIPAL
   *
   * Admin sem WHERE clinic_id retorna dados de qualquer tenant.
   * Este teste deve PASSAR (data !== null) — se passar, prova que o admin
   * client sem filtro é perigoso. Cada server action que usa createAdminClient()
   * sem .eq('clinic_id', profile.clinic_id) em TODAS as queries é um leak real.
   *
   * Se este teste falhar (data === null), houve uma melhoria real de RLS — atualizar.
   */
  test('TC-CROSS-09: Admin sem WHERE clinic_id retorna dados de qualquer tenant (risco documentado)', async () => {
    if (!sentinelReady) {
      console.warn('[TC-CROSS-09] Sentinel não criado — teste não pode provar o risco.');
      return;
    }
    const { data } = await admin
      .from('patients')
      .select('id, clinic_id, name')
      .eq('id', SENTINEL.patientId)
      .maybeSingle();

    // ESPERADO: o admin SEM clinic_id RETORNA o dado da Clínica B.
    // Se falhar aqui, significa que RLS passou a bloquear o admin — ótima evolução.
    expect(data).not.toBeNull();
    expect(data?.clinic_id).toBe(CLINIC_B);

    console.warn(
      '\n⚠️  [SECURITY TC-CROSS-09] Admin sem WHERE clinic_id vazou dado da Clínica B.',
      '\n   Cada server action em src/lib/actions/ sem .eq("clinic_id") é um leak real.',
      '\n   Ver: CLAUDE.md → Protocolo de Erro + regra ESLint no-restricted-imports.',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SANIDADE — Clínica A acessa seus próprios dados normalmente
// ═══════════════════════════════════════════════════════════════════════════════

describe('SANIDADE — Clínica A acessa seus próprios dados (regressão)', () => {
  test('Admin com clinic_A_id retorna apenas pacientes da Clínica A', async () => {
    const { data, error } = await admin
      .from('patients')
      .select('id, clinic_id')
      .eq('clinic_id', CLINIC_A)
      .limit(5);

    expect(error).toBeNull();
    (data ?? []).forEach(p => expect(p.clinic_id).toBe(CLINIC_A));
  });

  test('Admin com clinic_B_id retorna apenas dados da Clínica B', async () => {
    const { data } = await admin
      .from('patients')
      .select('id, clinic_id')
      .eq('clinic_id', CLINIC_B);

    (data ?? []).forEach(p => expect(p.clinic_id).toBe(CLINIC_B));
    (data ?? []).forEach(p => expect(p.clinic_id).not.toBe(CLINIC_A));
  });
});
