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

/** Create a test user via admin and return their ID. */
export async function createTestUser(params: {
  email: string;
  password: string;
  role: string;
  clinic_id: string;
  full_name: string;
}): Promise<string> {
  const admin = createAdminClient();
  let userId: string;

  const { data: authUser, error: createError } = await admin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
  });

  if (createError) {
    // User already exists — look them up
    if (createError.message?.includes('already been registered') || createError.message?.includes('already registered')) {
      const { data: listData } = await admin.auth.admin.listUsers();
      const existing = listData?.users.find((u) => u.email === params.email);
      if (!existing) throw createError;
      userId = existing.id;
      // Update password so test credentials always work
      await admin.auth.admin.updateUserById(userId, { password: params.password });
    } else {
      throw createError;
    }
  } else {
    userId = authUser.user.id;
  }

  // Always upsert profile to ensure correct role/clinic_id
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      clinic_id: params.clinic_id,
      full_name: params.full_name,
      role: params.role,
    }, { onConflict: 'id' });
  if (profileError) throw profileError;

  return userId;
}

/** Delete test user including profile. */
export async function deleteTestUser(email: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const user = data.users.find((u) => u.email === email);
  if (user) {
    await admin.from('profiles').delete().eq('id', user.id);
    await admin.auth.admin.deleteUser(user.id);
  }
}
