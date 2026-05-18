/**
 * Integration — State Machine de Grooming via RPC
 *
 * TC-SM-01: Transições válidas na máquina de estados
 * TC-SM-02: Transição inválida é rejeitada
 * TC-SM-03: Role incorreto para transição → bloqueado
 * TC-SM-04: Pagamento → central_cashier criado automaticamente
 */

import { createAdminClient, createUserClient } from '../helpers/supabase-test-client';
import { seedGroomingSession } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

async function getUserId(email: string): Promise<string> {
  const { data } = await admin.auth.admin.listUsers();
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`User not found: ${email}`);
  return user.id;
}

describe('TC-SM-01: Transições válidas na máquina de estados', () => {
  let sessionId: string;
  let receptionistId: string;
  let assistantId: string;

  beforeAll(async () => {
    receptionistId = await getUserId(fixtures.users.receptionistA.email);
    assistantId = await getUserId(fixtures.users.assistantA.email);
  });

  beforeEach(async () => {
    sessionId = await seedGroomingSession({ current_status: 'scheduled' } as never);
  });

  afterEach(async () => {
    await admin.from('central_cashier').delete().eq('source_id', sessionId);
    await admin.from('grooming_status_transitions').delete().eq('grooming_session_id', sessionId);
    await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  const transitions: Array<{ from: string; to: string; role: string }> = [
    { from: 'scheduled', to: 'arrived', role: 'receptionist' },
    { from: 'arrived', to: 'bathing', role: 'assistant' },
    { from: 'bathing', to: 'grooming', role: 'assistant' },
    { from: 'grooming', to: 'drying', role: 'assistant' },
    { from: 'drying', to: 'waiting_pickup', role: 'receptionist' },
  ];

  test.each(transitions)('$from → $to (role: $role)', async ({ from, to, role }) => {
    await admin.from('grooming_sessions').update({ current_status: from }).eq('id', sessionId);

    const actorId = role === 'assistant' ? assistantId : receptionistId;

    const { data, error } = await admin.rpc('rpc_grooming_update_status', {
      p_session_id: sessionId,
      p_new_status: to,
      p_actor_id: actorId,
      p_reason: `Teste: ${from} → ${to}`,
    });

    expect(error).toBeNull();
    // RPC returns TABLE → data is an array; take first row
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.current_status ?? row?.status).toBe(to);
    expect(row?.transition_id).toBeTruthy();

    // Audit trail criado
    const { data: audit } = await admin
      .from('grooming_status_transitions')
      .select('from_status, to_status')
      .eq('id', row.transition_id)
      .single();

    expect(audit!.from_status).toBe(from);
    expect(audit!.to_status).toBe(to);
  });
});

describe('TC-SM-02: Transição inválida é rejeitada', () => {
  let sessionId: string;
  let adminId: string;

  beforeAll(async () => {
    adminId = await getUserId(fixtures.users.adminA.email);
  });

  beforeEach(async () => {
    sessionId = await seedGroomingSession({ current_status: 'bathing' } as never);
  });

  afterEach(async () => {
    await admin.from('central_cashier').delete().eq('source_id', sessionId);
    await admin.from('grooming_status_transitions').delete().eq('grooming_session_id', sessionId);
    await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  test('bathing → delivered (salto inválido) → rejeitado', async () => {
    const { error } = await admin.rpc('rpc_grooming_update_status', {
      p_session_id: sessionId,
      p_new_status: 'delivered',
      p_actor_id: adminId,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/invalid.*transition|transição.*inválida/i);

    // Status permanece 'bathing'
    const { data: session } = await admin
      .from('grooming_sessions')
      .select('current_status')
      .eq('id', sessionId)
      .single();

    expect(session!.current_status).toBe('bathing');
  });

  test('paid → bathing (retrocesso) → rejeitado', async () => {
    await admin.from('grooming_sessions').update({ current_status: 'paid' }).eq('id', sessionId);

    const { error } = await admin.rpc('rpc_grooming_update_status', {
      p_session_id: sessionId,
      p_new_status: 'bathing',
      p_actor_id: adminId,
    });

    expect(error).not.toBeNull();
  });
});

describe('TC-SM-03: Role incorreto para transição → bloqueado', () => {
  let sessionId: string;
  let assistantId: string;

  beforeAll(async () => {
    assistantId = await getUserId(fixtures.users.assistantA.email);
  });

  beforeEach(async () => {
    sessionId = await seedGroomingSession({ current_status: 'scheduled' } as never);
  });

  afterEach(async () => {
    await admin.from('central_cashier').delete().eq('source_id', sessionId);
    await admin.from('grooming_status_transitions').delete().eq('grooming_session_id', sessionId);
    await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  test('Assistant tenta fazer check-in (scheduled→arrived) → rejeitado (role: receptionist required)', async () => {
    const { error } = await admin.rpc('rpc_grooming_update_status', {
      p_session_id: sessionId,
      p_new_status: 'arrived',
      p_actor_id: assistantId,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/permission|role|autorização|only.*check.in|receptionist/i);
  });
});

describe('TC-SM-04: Pagamento → central_cashier criado automaticamente', () => {
  let sessionId: string;
  let receptionistId: string;

  beforeAll(async () => {
    receptionistId = await getUserId(fixtures.users.receptionistA.email);
  });

  beforeEach(async () => {
    sessionId = await seedGroomingSession({
      current_status: 'waiting_pickup',
      price_total: 145.00,
      payment_status: 'pending',
    } as never);
  });

  afterEach(async () => {
    await admin.from('central_cashier').delete().eq('source_id', sessionId);
    await admin.from('grooming_status_transitions').delete().eq('grooming_session_id', sessionId);
    await admin.from('grooming_sessions').delete().eq('id', sessionId);
  });

  test('RPC finish_and_record cria entrada no caixa com amount=price_total', async () => {
    const { data, error } = await admin.rpc('rpc_grooming_finish_and_record_payment', {
      p_session_id: sessionId,
      p_actor_id: receptionistId,
      p_reason: 'Checkout teste integração',
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.current_status ?? row?.status).toBe('paid');
    expect(row?.cashier_entry_id).toBeTruthy();

    const { data: entry } = await admin
      .from('central_cashier')
      .select('amount, source_module, status, clinic_id')
      .eq('id', row.cashier_entry_id)
      .single();

    expect(Number(entry!.amount)).toBe(145.00);
    expect(entry!.source_module).toBe('grooming');
    expect(entry!.status).toBe('recorded');
    expect(entry!.clinic_id).toBe(fixtures.clinics.clinicA.id);
  });

  test('Sessão com price_total=0 NÃO cria entrada no caixa', async () => {
    await admin.from('grooming_sessions').update({ price_total: 0 }).eq('id', sessionId);

    const { data } = await admin.rpc('rpc_grooming_finish_and_record_payment', {
      p_session_id: sessionId,
      p_actor_id: receptionistId,
    });

    const rowZ = Array.isArray(data) ? data[0] : data;
    expect(rowZ?.cashier_entry_id ?? null).toBeNull();

    const { data: entries } = await admin
      .from('central_cashier')
      .select('id')
      .eq('source_id', sessionId);

    expect(entries).toHaveLength(0);
  });

  test('Checkout duplo (já pago) → idempotente, não duplica entrada', async () => {
    await admin.rpc('rpc_grooming_finish_and_record_payment', {
      p_session_id: sessionId,
      p_actor_id: receptionistId,
    });

    // Tentar pagar novamente
    const { error } = await admin.rpc('rpc_grooming_finish_and_record_payment', {
      p_session_id: sessionId,
      p_actor_id: receptionistId,
    });

    expect(error).not.toBeNull();

    const { data: entries } = await admin
      .from('central_cashier')
      .select('id')
      .eq('source_id', sessionId);

    expect(entries).toHaveLength(1);
  });
});
