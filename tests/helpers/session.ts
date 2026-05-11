import { createClient } from '@supabase/supabase-js';
import type { BrowserContext, Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000';

// Mirror de @supabase/ssr MAX_CHUNK_SIZE (chunker.js)
const MAX_CHUNK_SIZE = 3180;

function getProjectRef(): string {
  return new URL(SUPABASE_URL).hostname.split('.')[0];
}

function buildCookieChunks(
  key: string,
  value: string,
): Array<{ name: string; value: string }> {
  const encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value }];
  }

  const chunks: string[] = [];
  let remaining = encodedValue;

  while (remaining.length > 0) {
    let encodedHead = remaining.slice(0, MAX_CHUNK_SIZE);
    const lastEscapePos = encodedHead.lastIndexOf('%');
    if (lastEscapePos > MAX_CHUNK_SIZE - 3) {
      encodedHead = encodedHead.slice(0, lastEscapePos);
    }
    let valueHead = '';
    while (encodedHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedHead);
        break;
      } catch {
        if (encodedHead.at(-3) === '%' && encodedHead.length > 3) {
          encodedHead = encodedHead.slice(0, encodedHead.length - 3);
        } else {
          break;
        }
      }
    }
    chunks.push(valueHead);
    remaining = remaining.slice(encodedHead.length);
  }

  return chunks.map((v, i) => ({ name: `${key}.${i}`, value: v }));
}

/**
 * Autentica via Supabase API (sem UI) e injeta os cookies de sessão no
 * browser context. Garante JWT sempre fresco — não expira mid-run.
 */
export async function injectFreshSession(
  context: BrowserContext,
  email: string,
  password: string,
): Promise<void> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`[session] Auth failed for ${email}: ${error?.message ?? 'no session'}`);
  }

  const { access_token, refresh_token, expires_at, user } = data.session;
  const ref = getProjectRef();
  const cookieKey = `sb-${ref}-auth-token`;

  const sessionPayload = JSON.stringify({
    access_token,
    token_type: 'bearer',
    expires_in: (expires_at ?? 0) - Math.floor(Date.now() / 1000),
    expires_at,
    refresh_token,
    user,
  });

  const domain = new URL(BASE_URL).hostname;
  const chunks = buildCookieChunks(cookieKey, sessionPayload);

  await context.addCookies(
    chunks.map(({ name, value }) => ({
      name,
      value,
      domain,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
      expires: expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    })),
  );
}

/**
 * Substituto rápido para loginAs via UI.
 * Injeta sessão fresca e navega para targetPath (default: /dashboard).
 */
export async function loginViaApi(
  page: Page,
  email: string,
  password: string,
  targetPath = '/dashboard',
): Promise<void> {
  await injectFreshSession(page.context(), email, password);
  await page.goto(`${BASE_URL}${targetPath}`);
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}
