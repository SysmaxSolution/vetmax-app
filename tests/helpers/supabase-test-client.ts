import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Admin client — bypasses RLS. Use only in setup/teardown. */
export function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** RLS-enforced client authenticated as a specific user via service role impersonation. */
export async function createUserClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
  return client;
}

/** Sign in and return access token for API-level tests. */
export async function getAccessToken(email: string, password: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) throw error;

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  return session.session!.access_token;
}

/**
 * Find-or-create a test user and ensure their profile has the correct clinic_id.
 *
 * Strategy: NEVER delete + recreate. Instead, find the existing user (or create if absent)
 * and upsert their profile. This preserves the same UUID across test runs, eliminating
 * Supabase auth eventual-consistency issues where a deleted user can still be authenticated
 * briefly while their profile is already gone.
 */
export async function createTestUser(params: {
  email: string;
  password: string;
  role: string;
  clinic_id: string;
  full_name: string;
}): Promise<string> {
  const admin = createAdminClient();
  let userId: string;

  // ── 1. Find existing user across all pages ────────────────────────────────
  let existingId: string | undefined;
  let page = 1;
  while (!existingId) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) break;
    const found = data.users.find((u) => u.email === params.email);
    if (found) {
      existingId = found.id;
    } else if (data.users.length < 100) {
      break; // last page — user does not exist
    }
    page++;
  }

  if (existingId) {
    // ── 2a. User exists — update password (keep same UUID to avoid auth cache issues) ──
    userId = existingId;
    await admin.auth.admin.updateUserById(userId, {
      password: params.password,
      email_confirm: true,
    });
  } else {
    // ── 2b. User does not exist — create fresh ───────────────────────────────
    const { data: authUser, error: createError } = await admin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true,
    });

    if (createError?.message?.includes('already been registered') || createError?.message?.includes('already exists')) {
      // Pagination miss: user exists but wasn't found by listUsers (rate limit or eventual consistency).
      // Exhaustively search larger perPage to find the user's ID.
      const { data: allData } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const found = allData?.users.find(u => u.email === params.email)
      if (!found) throw new Error(`createUser falhou e usuário não localizável: ${params.email}`)
      userId = found.id
      await admin.auth.admin.updateUserById(userId, { password: params.password, email_confirm: true })
    } else if (createError) {
      throw new Error(`createUser falhou para ${params.email}: ${createError.message}`)
    } else {
      userId = authUser!.user.id
    }
  }

  // ── 3. Upsert profile with correct clinic_id ──────────────────────────────
  const { error: profileError } = await admin
    .from('profiles')
    .upsert(
      { id: userId, clinic_id: params.clinic_id, full_name: params.full_name, role: params.role },
      { onConflict: 'id', ignoreDuplicates: false },
    );
  if (profileError) throw new Error(`Profile upsert falhou para ${params.email}: ${profileError.message}`);

  // ── 4. Verify clinic_id was actually persisted ────────────────────────────
  const { data: verifyProfile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', userId)
    .single();

  if (!verifyProfile?.clinic_id) {
    // Fallback: explicit UPDATE in case upsert hit an edge case
    console.warn(`[createTestUser] clinic_id null após upsert para ${params.email} — forçando UPDATE`);
    const { error: retryError } = await admin
      .from('profiles')
      .update({ clinic_id: params.clinic_id, full_name: params.full_name, role: params.role })
      .eq('id', userId);
    if (retryError) throw new Error(`Retry UPDATE falhou para ${params.email}: ${retryError.message}`);

    const { data: finalProfile } = await admin
      .from('profiles')
      .select('clinic_id')
      .eq('id', userId)
      .single();
    if (!finalProfile?.clinic_id) {
      throw new Error(`CRITICAL: clinic_id permanece null para ${params.email} após upsert + UPDATE`);
    }
  }

  return userId;
}

/** Delete test user including profile. Non-fatal: loga e continua se usuário não existir. */
export async function deleteTestUser(email: string): Promise<void> {
  const admin = createAdminClient()
  try {
    let pageNum = 1
    let found = false
    while (!found) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pageNum, perPage: 100 })
      if (error) {
        console.warn(`[seed] listUsers falhou ao buscar ${email}:`, error.message)
        break
      }
      const user = data.users.find((u) => u.email === email)
      if (user) {
        await admin.from('profiles').delete().eq('id', user.id)
        await admin.auth.admin.deleteUser(user.id)
        found = true
      } else if (data.users.length < 100) {
        break
      }
      pageNum++
    }
  } catch (e) {
    console.warn(`[seed] Aviso ao deletar ${email}: ${(e as Error).message}`)
  }
}
