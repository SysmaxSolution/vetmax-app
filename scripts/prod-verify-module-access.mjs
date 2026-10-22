// PRODUÇÃO — Verificação read-only do acesso a módulos por clínica.
//
// Reproduz FIELMENTE src/lib/subscription/gatekeeper.ts → getClinicSubscriptionState
// (e portanto checkModuleAccess) a partir do banco, sem passar pelo app. Serve de
// prova de que cada módulo técnico está liberado (ou não) para cada clínica.
//
// Uso:
//   node scripts/prod-verify-module-access.mjs            # todas as clínicas
//   node scripts/prod-verify-module-access.mjs --json     # saída JSON

import fs from 'node:fs'
import pg from 'pg'

const ENV_PATH = process.env.VETMAX_ENV_PATH ?? 'C:\\SysMax\\.env.local'
const EXPECTED_REF = 'yivjuhurcadxtllmkkqd'
const AS_JSON = process.argv.includes('--json')

// Espelho de src/config (ver prod-grant-all-modules-animais.mjs para a proveniência)
const PATH_MODULE_KEYS = [
  'reception', 'patients', 'triage', 'consultation', 'exams', 'hospitalization',
  'surgery', 'grooming', 'pharmacy', 'sales', 'cashier', 'registry',
  'whatsapp_intelligent', 'purchases', 'financial', 'reports', 'billing',
  'internal_chat',
]
const ACCESS_CATALOG_KEYS = [
  'reception', 'triage', 'consultation', 'exams', 'hospitalization', 'surgery',
  'pharmacy', 'grooming', 'sales', 'cashier', 'patients', 'purchases',
  'financial', 'reports', 'registry', 'whatsapp', 'whatsapp_intelligent',
  'mentor', 'petlove_reconciliation', 'internal_chat',
]
const FREE_MODULES = {
  vet_clinic:     ['reception', 'patients', 'consultation', 'management'],
  pet_aesthetics: ['reception', 'patients', 'grooming',     'management'],
}
const EXTRA_KEYS = ['management']

const env = {}
for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
if (env.SUPABASE_PROJECT_REF !== EXPECTED_REF) {
  console.error(`ABORTADO: .env.local não aponta para produção (${EXPECTED_REF}).`)
  process.exit(1)
}

/** Porte 1:1 de getClinicSubscriptionState (gatekeeper.ts). */
function computeState({ planName, status, businessType, contractedKeys, catalog }) {
  const freeKeys = FREE_MODULES[businessType] ?? FREE_MODULES.vet_clinic
  const allowed = new Set(freeKeys)
  const usable = status === 'active' || status === 'trialing'
  if (usable) {
    for (const row of catalog) {
      const tier = row.included_in_plan
      const grantedByPlan =
        (tier === 'premium' && (planName === 'premium' || planName === 'enterprise')) ||
        (tier === 'enterprise' && planName === 'enterprise')
      if (grantedByPlan) (row.included_module_keys ?? []).forEach(k => allowed.add(k))
    }
    const catalogByKey = new Map(catalog.map(r => [r.module_key, r.included_module_keys ?? []]))
    for (const key of contractedKeys) {
      const included = catalogByKey.get(key)
      if (included && included.length > 0) included.forEach(k => allowed.add(k))
      else if (!catalogByKey.has(key)) allowed.add(key)
    }
  }
  return allowed
}

const c = new pg.Client({ connectionString: env.DATABASE_URL })
await c.connect()
try {
  const { rows: catalog } = await c.query(
    `SELECT module_key, included_module_keys, included_in_plan FROM subscription_module_catalog`
  )
  const { rows: clinics } = await c.query(
    `SELECT c.id, c.name, c.business_type, c.active_modules,
            COALESCE(ts.plan_name, 'free')   AS plan_name,
            COALESCE(ts.status, 'active')    AS status
       FROM clinics c LEFT JOIN tenant_subscriptions ts ON ts.clinic_id = c.id
      ORDER BY c.name`
  )
  const { rows: contracted } = await c.query(
    `SELECT clinic_id, module_key FROM clinic_contracted_modules WHERE is_active`
  )

  const ALL = [...new Set([
    ...PATH_MODULE_KEYS, ...ACCESS_CATALOG_KEYS, ...EXTRA_KEYS,
    ...catalog.flatMap(r => r.included_module_keys ?? []),
  ])].sort()

  const out = []
  for (const clinic of clinics) {
    const keys = contracted.filter(r => r.clinic_id === clinic.id).map(r => r.module_key)
    const allowed = computeState({
      planName: clinic.plan_name, status: clinic.status,
      businessType: clinic.business_type, contractedKeys: keys, catalog,
    })
    out.push({
      clinic: clinic.name, id: clinic.id, plan: clinic.plan_name, status: clinic.status,
      contracted: keys.length,
      allowed: ALL.filter(k => allowed.has(k)),
      blocked: ALL.filter(k => !allowed.has(k)),
      active_modules: clinic.active_modules ?? [],
    })
  }

  if (AS_JSON) { console.log(JSON.stringify({ all_modules: ALL, clinics: out }, null, 2)); process.exit(0) }

  console.log(`checkModuleAccess reproduzido — produção ${EXPECTED_REF}`)
  console.log(`Módulos técnicos avaliados (${ALL.length}): ${ALL.join(', ')}\n`)
  for (const r of out) {
    console.log('─'.repeat(78))
    console.log(`${r.clinic}  [${r.id}]`)
    console.log(`  plano: ${r.plan}/${r.status} · contratados ativos: ${r.contracted}`)
    console.log(`  LIBERADOS (${r.allowed.length}/${ALL.length}):`)
    for (const k of ALL) {
      const ok = r.allowed.includes(k)
      const inMenu = r.active_modules.includes(k)
      console.log(`    ${ok ? 'OK  ' : 'BLOQ'} ${k.padEnd(24)} ${ok ? '' : '(PremiumPaywall)'}${ok && !inMenu ? '· liberado, mas fora de active_modules (menu)' : ''}`)
    }
  }
  console.log('─'.repeat(78))
} finally {
  await c.end()
}
