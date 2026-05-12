import { createClient } from '@supabase/supabase-js'
import { seedClinics, seedUsers, seedTutorsAndPets, seedProductPrices } from './helpers/db-seed'
import { createAdminClient } from './helpers/supabase-test-client'
import fixtures from './fixtures/test-data.json'
import * as dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), 'vetmax-app', '.env.local') })

export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000'
export const AUTH_DIR  = path.resolve(process.cwd(), 'tests/.auth')

// Todas as roles que precisam de sessão salva
const ROLES = [
  { key: 'admin',        email: 'admin@clinica-alfa.test',      password: 'TestPassword@123' },
  { key: 'vet',          email: 'vet@clinica-alfa.test',         password: 'TestPassword@123' },
  { key: 'receptionist', email: 'recepcao@clinica-alfa.test',    password: 'TestPassword@123' },
  { key: 'assistant',    email: 'assistente@clinica-alfa.test',  password: 'TestPassword@123' },
  { key: 'accountant',   email: 'contador@clinica-alfa.test',    password: 'TestPassword@123' },
  { key: 'adminB',       email: 'admin@clinica-beta.test',       password: 'TestPassword@123' },
]

const MAX_CHUNK_SIZE = 3180 // @supabase/ssr 0.10.x chunker constant

function buildStorageStateCookies(
  session: Record<string, unknown>,
  projectRef: string,
): Array<Record<string, unknown>> {
  const cookieKey = `sb-${projectRef}-auth-token`
  // @supabase/ssr encodes value as base64url with 'base64-' prefix
  const sessionJson = JSON.stringify(session)
  const encodedValue = `base64-${Buffer.from(sessionJson).toString('base64url')}`
  const expiresAt = (session.expires_at as number | undefined) ?? -1

  const baseCookie = {
    domain: 'localhost',
    path: '/',
    expires: expiresAt,
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }

  // Check if chunking is needed (matching @supabase/ssr/utils/chunker.js logic)
  if (encodeURIComponent(encodedValue).length <= MAX_CHUNK_SIZE) {
    return [{ ...baseCookie, name: cookieKey, value: encodedValue }]
  }

  // Split into chunks
  const chunks: string[] = []
  let remaining = encodedValue
  while (remaining.length > 0) {
    let head = encodeURIComponent(remaining).slice(0, MAX_CHUNK_SIZE)
    // Trim incomplete percent-encoded sequences
    while (head.length > 0) {
      try {
        const decoded = decodeURIComponent(head)
        chunks.push(decoded)
        remaining = remaining.slice(decoded.length)
        break
      } catch {
        head = head.slice(0, head.length - 3)
      }
    }
    if (head.length === 0) break
  }

  return chunks.map((chunk, i) => ({ ...baseCookie, name: `${cookieKey}.${i}`, value: chunk }))
}

export default async function globalSetup() {
  console.log('\n[SETUP] Seeding test database...')
  await seedClinics()
  await seedUsers()
  await seedTutorsAndPets()
  await seedProductPrices()
  console.log('[SETUP] Database seeded.\n')

  // Aguarda propagação das escritas no Supabase (evita read-after-write em profile com clinic_id)
  await new Promise(r => setTimeout(r, 5000))

  // ── Verificação pós-seed: garante que todo profile tem clinic_id antes dos logins ──
  const adminDb = createAdminClient()
  const { data: allAuthUsers } = await adminDb.auth.admin.listUsers({ perPage: 200 })
  const testEmails = new Set(ROLES.map(r => r.email))
  const testUsers = (allAuthUsers?.users ?? []).filter(u => testEmails.has(u.email ?? ''))

  let profileFixNeeded = 0
  for (const authUser of testUsers) {
    const { data: profile } = await adminDb.from('profiles').select('clinic_id').eq('id', authUser.id).single()
    if (!profile?.clinic_id) {
      profileFixNeeded++
      console.error(`[SETUP] ✗ Profile sem clinic_id: ${authUser.email} (id=${authUser.id})`)
      const fixtureUser = (Object.values(fixtures.users) as Array<{ email: string; clinic_id: string; full_name: string; role: string }>)
        .find(u => u.email === authUser.email)
      if (fixtureUser) {
        await adminDb.from('profiles').upsert(
          { id: authUser.id, clinic_id: fixtureUser.clinic_id, full_name: fixtureUser.full_name, role: fixtureUser.role },
          { onConflict: 'id', ignoreDuplicates: false }
        )
        console.log(`[SETUP]   → Reparado profile de ${authUser.email} com clinic_id=${fixtureUser.clinic_id}`)
      }
    } else {
      console.log(`[SETUP] ✓ Profile OK: ${authUser.email} → clinic_id=${profile.clinic_id}`)
    }
  }

  if (profileFixNeeded > 0) {
    console.warn(`[SETUP] ⚠️  ${profileFixNeeded} profile(s) foram reparados. Aguardando propagação...`)
    await new Promise(r => setTimeout(r, 3000))
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true })
  console.log('[SETUP] Generating storageState per role via Supabase API...')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? new URL(supabaseUrl).hostname.split('.')[0]

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[SETUP] ✗ NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY não definidos')
    process.exit(1)
  }

  let failures = 0

  for (const role of ROLES) {
    const statePath = path.join(AUTH_DIR, `${role.key}.json`)
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: role.email,
        password: role.password,
      })

      if (error || !data.session) {
        throw new Error(error?.message ?? 'Sessão nula após signInWithPassword')
      }

      const session = data.session as unknown as Record<string, unknown>
      const cookies = buildStorageStateCookies(session, projectRef)
      fs.writeFileSync(statePath, JSON.stringify({ cookies, origins: [] }))
      console.log(`[SETUP] ✓ storageState via API: ${role.key} (${role.email}) [${cookies.length} cookie(s)]`)

      // Limpar sessão local (não invalidar o token — será usado pelos testes)
      await supabase.auth.signOut({ scope: 'local' })
    } catch (err) {
      failures++
      console.error(`[SETUP] ✗ FALHOU: ${role.key} (${role.email}) — ${(err as Error).message}`)
      fs.writeFileSync(statePath, JSON.stringify({ cookies: [], origins: [] }))
    }
  }

  if (failures > 0) {
    console.warn(`[SETUP] ⚠️  ${failures} role(s) sem storageState — usando fallback de injeção de cookies.\n`)
  } else {
    console.log('[SETUP] ✅ Todos os storageStates prontos.\n')
  }
}
