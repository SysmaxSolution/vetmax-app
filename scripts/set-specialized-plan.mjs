// SaaS Fase 1 — Runbook do plano ESPECIALIZADO (operação interna SysMax).
// Imputa manualmente plano + preço + módulos de uma clínica e sincroniza as
// camadas legadas (clinics.active_modules / flow_config), replicando o helper
// syncClinicModulesFromContract de src/lib/actions/subscription.ts.
//
// Uso:
//   node scripts/set-specialized-plan.mjs --clinic "Nome da Clínica" \
//        --price 350 --modules hospitalization_surgery,billing_nfse,exams
//
//   --modules aceita chaves COMERCIAIS do subscription_module_catalog.
//   Omitir --modules mantém os contratos atuais (só muda plano/preço).
//   --dry-run mostra o resultado sem gravar.
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : null
}
const clinicName = arg('clinic')
const price      = arg('price')
const modulesArg = arg('modules')
const dryRun     = process.argv.includes('--dry-run')

if (!clinicName) {
  console.error('Uso: node scripts/set-specialized-plan.mjs --clinic "Nome" [--price 350] [--modules key1,key2] [--dry-run]')
  process.exit(1)
}

// FREE_MODULES — espelha src/config/access-matrix.ts (manter em sincronia)
const FREE_MODULES = {
  vet_clinic:     ['cashier', 'reception', 'patients', 'consultation', 'management'],
  pet_aesthetics: ['cashier', 'reception', 'patients', 'grooming',     'management'],
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
try {
  const { rows: clinics } = await c.query(
    `SELECT id, name, business_type, active_modules, flow_config FROM clinics WHERE name ILIKE $1`,
    [`%${clinicName}%`]
  )
  if (clinics.length !== 1) {
    console.error(`Esperava 1 clínica para "${clinicName}", encontrei ${clinics.length}:`,
      clinics.map(r => r.name).join(', ') || '(nenhuma)')
    process.exit(1)
  }
  const clinic = clinics[0]
  console.log(`Clínica: ${clinic.name} (${clinic.id}) — ${clinic.business_type}`)

  const { rows: catalog } = await c.query(
    `SELECT module_key, included_module_keys, flow_flags FROM subscription_module_catalog`
  )
  const catalogKeys = new Set(catalog.map(r => r.module_key))

  await c.query('BEGIN')

  // 1. Plano + preço
  await c.query(
    `INSERT INTO tenant_subscriptions (clinic_id, plan_name, status, custom_price, billing_cycle)
       VALUES ($1, 'specialized', 'active', $2, NULL)
     ON CONFLICT (clinic_id) DO UPDATE
       SET plan_name = 'specialized', status = 'active', custom_price = $2,
           billing_cycle = NULL, cancelled_at = NULL`,
    [clinic.id, price != null ? Number(price) : null]
  )

  // 2. Módulos contratados (se informados): desativa os comerciais não listados
  if (modulesArg != null) {
    const wanted = modulesArg.split(',').map(s => s.trim()).filter(Boolean)
    for (const key of wanted) {
      if (!catalogKeys.has(key)) {
        throw new Error(`Módulo "${key}" não existe no catálogo. Válidos: ${[...catalogKeys].join(', ')}`)
      }
    }
    await c.query(
      `UPDATE clinic_contracted_modules SET is_active = FALSE
        WHERE clinic_id = $1 AND module_key = ANY($2)`,
      [clinic.id, [...catalogKeys].filter(k => !wanted.includes(k))]
    )
    for (const key of wanted) {
      await c.query(
        `INSERT INTO clinic_contracted_modules (clinic_id, module_key, is_active, contracted_at)
           VALUES ($1, $2, TRUE, now())
         ON CONFLICT (clinic_id, module_key) DO UPDATE SET is_active = TRUE`,
        [clinic.id, key]
      )
    }
  }

  // 3. Sync das camadas legadas (replica syncClinicModulesFromContract)
  const { rows: contracted } = await c.query(
    `SELECT module_key FROM clinic_contracted_modules WHERE clinic_id = $1 AND is_active`,
    [clinic.id]
  )
  const contractedSet = new Set(contracted.map(r => r.module_key))

  const managedKeys = new Set(), managedFlags = new Set()
  for (const row of catalog) {
    ;(row.included_module_keys ?? []).forEach(k => managedKeys.add(k))
    ;(row.flow_flags ?? []).forEach(f => managedFlags.add(f))
  }
  const granted = new Set(FREE_MODULES[clinic.business_type] ?? FREE_MODULES.vet_clinic)
  const grantedFlags = new Set()
  for (const row of catalog) {
    if (!contractedSet.has(row.module_key)) continue
    ;(row.included_module_keys ?? []).forEach(k => granted.add(k))
    ;(row.flow_flags ?? []).forEach(f => grantedFlags.add(f))
  }
  for (const key of contractedSet) {
    if (!catalogKeys.has(key)) granted.add(key)  // key técnica legada (backfill)
  }

  const currentModules = clinic.active_modules ?? []
  const nextModules = [...new Set([...granted, ...currentModules.filter(k => !managedKeys.has(k))])]
  const nextFlow = { ...(clinic.flow_config ?? {}) }
  for (const flag of managedFlags) nextFlow[flag] = grantedFlags.has(flag)

  await c.query(
    `UPDATE clinics SET active_modules = $2::jsonb, flow_config = $3::jsonb WHERE id = $1`,
    [clinic.id, JSON.stringify(nextModules), JSON.stringify(nextFlow)]
  )

  if (dryRun) {
    await c.query('ROLLBACK')
    console.log('[dry-run] ROLLBACK — nada gravado.')
  } else {
    await c.query('COMMIT')
  }

  console.log('Plano: specialized', price != null ? `(R$ ${Number(price).toFixed(2)}/mês)` : '(sem preço imputado)')
  console.log('Contratados ativos:', [...contractedSet].join(', ') || '(nenhum)')
  console.log('active_modules →', JSON.stringify(nextModules))
  console.log('flow_config →', JSON.stringify(nextFlow))
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('ERRO:', e.message)
  process.exit(1)
} finally {
  await c.end()
}
