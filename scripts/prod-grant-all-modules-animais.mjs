// PRODUÇÃO — Libera TODOS os módulos técnicos para as 3 clínicas do grupo Animais.
//
// Decisão do Diretor (2026-09-24, pós-virada): "Animais deve ter todos os módulos
// liberados, Cat & Dog segue com os módulos do Free."
//
// COMO O ACESSO É DECIDIDO (src/lib/subscription/gatekeeper.ts):
//   allowedTechnicalKeys = FREE_MODULES[business_type]
//                        ∪ included_module_keys das linhas do catálogo cujo
//                          included_in_plan é coberto pelo plano
//                          (premium → 'premium'; enterprise → 'premium'+'enterprise')
//                        ∪ expansão de clinic_contracted_modules(is_active):
//                            key COM entrada no catálogo → included_module_keys
//                            key SEM entrada no catálogo → a própria key (legado)
//   (só quando tenant_subscriptions.status ∈ {active, trialing})
//
// POR QUE NÃO BASTA MUDAR O PLANO:
//   • o gatekeeper só casa os tiers 'premium' e 'enterprise'; as linhas do catálogo
//     com included_in_plan='starter' (triage, sales_pdv, stock_kits,
//     whatsapp_triggers) NÃO são concedidas por nenhum plano;
//   • 'cashier', 'registry' e 'mentor' não aparecem em nenhum included_module_keys
//     do catálogo — só existem pela via legada (concessão direta por clínica).
//
// ESTRATÉGIA ESCOLHIDA (explícita e à prova de re-grade do catálogo):
//   1. plan_name = 'specialized' — é o plano "sob medida" previsto no código para
//      grants manuais (gatekeeper: "grants manuais do specialized"). Ele NÃO
//      concede bundle nenhum (todas as concessões ficam visíveis na tabela), e
//      ao mesmo tempo tira as clínicas do 'free', destravando os gates de plano
//      que NÃO são de módulo: split de convênio (ConsultationServicesPanel),
//      preços customizados por pet (CustomPricesEditor), aba Modelos de
//      Documentos (MANAGEMENT_TAB_BLOCKED_ON_FREE) e os toggles PRO do
//      ModulesTab (isPaidPlan). provision.ts não mexe em quotas de 'specialized'.
//   2. clinic_contracted_modules recebe UMA LINHA POR CHAVE TÉCNICA não-free.
//
// O QUE ESTE SCRIPT **NÃO** FAZ (de propósito):
//   • não toca clinics.active_modules nem flow_config — isso é a escolha
//     operacional de cada clínica (menu/fluxo), agora editável pelo admin em
//     Gestão > Módulos, já que o plano deixou de ser Free;
//   • não toca lifecycle_state / is_grandfathered / custom_price (lifecycle NULL
//     mantém a clínica fora do cron de dunning);
//   • não toca a CLÍNICA CAT & DOG (trava dura abaixo).
//
// Uso:
//   node scripts/prod-grant-all-modules-animais.mjs            # dry-run
//   node scripts/prod-grant-all-modules-animais.mjs --apply    # grava (1 transação)

import fs from 'node:fs'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const ENV_PATH = process.env.VETMAX_ENV_PATH ?? 'C:\\SysMax\\.env.local'
const EXPECTED_REF = 'yivjuhurcadxtllmkkqd' // produção

// ─── Alvos e trava ───────────────────────────────────────────────────────────
const TARGETS = [
  { id: '3c6d06ad-17ce-4811-a7df-6092bd3fb8c6', name: 'Animais Clínica Veterinária' },
  { id: '2b7a90c3-fb5a-40d3-bc1a-e3f78e0756f4', name: 'Animais Diagnóstico por Imagem' },
  { id: '7be4d7bb-0f70-453c-bf4f-fe37bf24a9fb', name: 'Animais Pet' },
]
/** NUNCA tocar: fica no Free por decisão do Diretor. */
const FORBIDDEN_IDS = new Set(['032976c0-9171-4496-8601-db0b531670c8']) // CLÍNICA CAT & DOG

// ─── Espelho do código (src/config) — chaves TÉCNICAS existentes ─────────────
// src/config/path-modules.ts → PATH_SEGMENT_TO_MODULE (valores)
const PATH_MODULE_KEYS = [
  'reception', 'patients', 'triage', 'consultation', 'exams', 'hospitalization',
  'surgery', 'grooming', 'pharmacy', 'sales', 'cashier', 'registry',
  'whatsapp_intelligent', 'purchases', 'financial', 'reports', 'billing',
  'internal_chat',
]
// src/config/access-catalog.ts → ACCESS_CATALOG[].key
const ACCESS_CATALOG_KEYS = [
  'reception', 'triage', 'consultation', 'exams', 'hospitalization', 'surgery',
  'pharmacy', 'grooming', 'sales', 'cashier', 'patients', 'purchases',
  'financial', 'reports', 'registry', 'whatsapp', 'whatsapp_intelligent',
  'mentor', 'petlove_reconciliation', 'internal_chat',
]
// src/config/access-matrix.ts → FREE_MODULES
const FREE_MODULES = {
  vet_clinic:     ['reception', 'patients', 'consultation', 'management'],
  pet_aesthetics: ['reception', 'patients', 'grooming',     'management'],
}
const EXTRA_KEYS = ['management'] // módulo core sem rota mapeada no path-modules

// ─── env ─────────────────────────────────────────────────────────────────────
const env = {}
for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
if (env.SUPABASE_PROJECT_REF !== EXPECTED_REF) {
  console.error(`ABORTADO: .env.local aponta para "${env.SUPABASE_PROJECT_REF}", esperado "${EXPECTED_REF}".`)
  process.exit(1)
}
if (!env.DATABASE_URL || !env.DATABASE_URL.includes(EXPECTED_REF)) {
  console.error('ABORTADO: DATABASE_URL ausente ou não aponta para o projeto de produção.')
  process.exit(1)
}

// ─── Trava dura: nenhum alvo pode ser uma clínica proibida ───────────────────
for (const t of TARGETS) {
  if (FORBIDDEN_IDS.has(t.id)) {
    console.error(`ABORTADO: plano de execução inclui clínica PROIBIDA (${t.id}).`)
    process.exit(1)
  }
}

const c = new pg.Client({ connectionString: env.DATABASE_URL })
await c.connect()

function sortU(a) { return [...new Set(a)].sort() }

try {
  // ── Leitura do estado atual ────────────────────────────────────────────────
  const { rows: catalog } = await c.query(
    `SELECT module_key, included_module_keys, included_in_plan FROM subscription_module_catalog`
  )
  const catalogByKey = new Map(catalog.map(r => [r.module_key, r.included_module_keys ?? []]))

  const { rows: clinics } = await c.query(
    `SELECT c.id, c.name, c.business_type, ts.plan_name, ts.status, ts.lifecycle_state,
            ts.is_grandfathered, ts.custom_price
       FROM clinics c LEFT JOIN tenant_subscriptions ts ON ts.clinic_id = c.id
      ORDER BY c.name`
  )
  const byId = new Map(clinics.map(r => [r.id, r]))

  // Snapshot "antes" da clínica intocável (prova de integridade)
  const forbiddenBefore = await c.query(
    `SELECT ts.plan_name, ts.status, ts.custom_price, ts.billing_cycle, ts.lifecycle_state,
            ts.is_grandfathered, ts.updated_at,
            (SELECT count(*) FROM clinic_contracted_modules m WHERE m.clinic_id = c.id) AS contracted,
            c.active_modules, c.flow_config
       FROM clinics c LEFT JOIN tenant_subscriptions ts ON ts.clinic_id = c.id
      WHERE c.id = ANY($1::uuid[])`,
    [[...FORBIDDEN_IDS]]
  )

  // Universo de chaves técnicas = código ∪ tudo que o catálogo do banco concede
  const catalogTechnical = catalog.flatMap(r => r.included_module_keys ?? [])
  const ALL_TECHNICAL = sortU([
    ...PATH_MODULE_KEYS, ...ACCESS_CATALOG_KEYS, ...EXTRA_KEYS, ...catalogTechnical,
  ])

  console.log('='.repeat(78))
  console.log(`PRODUÇÃO ${EXPECTED_REF} — ${APPLY ? 'APLICAÇÃO' : 'DRY-RUN (nada será gravado)'}`)
  console.log('='.repeat(78))
  console.log(`\nChaves técnicas existentes (${ALL_TECHNICAL.length}): ${ALL_TECHNICAL.join(', ')}`)
  console.log(`Trava: ${[...FORBIDDEN_IDS].join(', ')} (CLÍNICA CAT & DOG) — NÃO será tocada.\n`)

  const plan = []
  for (const t of TARGETS) {
    const clinic = byId.get(t.id)
    if (!clinic) throw new Error(`Clínica ${t.id} não existe em produção.`)
    if (clinic.name !== t.name) {
      throw new Error(`Nome divergente para ${t.id}: banco="${clinic.name}", esperado="${t.name}".`)
    }
    const free = FREE_MODULES[clinic.business_type] ?? FREE_MODULES.vet_clinic
    const toGrant = ALL_TECHNICAL.filter(k => !free.includes(k))

    // Segurança: se a key existir como key COMERCIAL do catálogo, ela precisa
    // expandir para si mesma — senão a concessão não liberaria o que queremos.
    for (const key of toGrant) {
      if (catalogByKey.has(key) && !catalogByKey.get(key).includes(key)) {
        throw new Error(
          `Key "${key}" existe no catálogo mas não se auto-inclui ` +
          `(included_module_keys=${JSON.stringify(catalogByKey.get(key))}). Revisar antes de gravar.`
        )
      }
    }

    const { rows: current } = await c.query(
      `SELECT module_key, is_active FROM clinic_contracted_modules WHERE clinic_id = $1`,
      [t.id]
    )
    const already = new Set(current.filter(r => r.is_active).map(r => r.module_key))
    const missing = toGrant.filter(k => !already.has(k))

    plan.push({ clinic, free, toGrant, missing, currentCount: current.length })

    console.log(`── ${clinic.name}`)
    console.log(`   id             : ${clinic.id}  (${clinic.business_type})`)
    console.log(`   plano          : ${clinic.plan_name}/${clinic.status} → specialized/active`)
    console.log(`   free (já tem)  : ${free.join(', ')}`)
    console.log(`   contratados    : ${current.length} linha(s) hoje (${already.size} ativa(s))`)
    console.log(`   a conceder     : ${missing.length} chave(s) → ${missing.join(', ') || '(nenhuma)'}`)
    console.log(`   acesso final   : ${sortU([...free, ...toGrant]).length} módulos\n`)
  }

  if (!APPLY) {
    console.log('DRY-RUN concluído. Rode com --apply para gravar.')
    process.exit(0)
  }

  // ── Escrita (1 transação, idempotente) ────────────────────────────────────
  await c.query('BEGIN')

  let subsTouched = 0, modsTouched = 0
  for (const p of plan) {
    const r1 = await c.query(
      `UPDATE tenant_subscriptions
          SET plan_name = 'specialized', status = 'active', cancelled_at = NULL, updated_at = now()
        WHERE clinic_id = $1::uuid AND clinic_id <> ALL($2::uuid[])`,
      [p.clinic.id, [...FORBIDDEN_IDS]]
    )
    if (r1.rowCount === 0) {
      // Sem linha de assinatura → cria (não deve acontecer nesta base, mas é idempotente)
      await c.query(
        `INSERT INTO tenant_subscriptions (clinic_id, plan_name, status) VALUES ($1::uuid, 'specialized', 'active')
         ON CONFLICT (clinic_id) DO UPDATE SET plan_name = 'specialized', status = 'active'`,
        [p.clinic.id]
      )
      subsTouched += 1
    } else {
      subsTouched += r1.rowCount
    }

    for (const key of p.toGrant) {
      const r2 = await c.query(
        `INSERT INTO clinic_contracted_modules (clinic_id, module_key, is_active, contracted_at)
              SELECT $1::uuid, $2::text, TRUE, now()
               WHERE $1::uuid <> ALL($3::uuid[])
         ON CONFLICT (clinic_id, module_key)
         DO UPDATE SET is_active = TRUE, updated_at = now()`,
        [p.clinic.id, key, [...FORBIDDEN_IDS]]
      )
      modsTouched += r2.rowCount
    }
  }

  // ── Asserções antes do COMMIT ─────────────────────────────────────────────
  const fb = forbiddenBefore.rows[0]
  const { rows: fa } = await c.query(
    `SELECT ts.plan_name, ts.status, ts.custom_price, ts.billing_cycle, ts.lifecycle_state,
            ts.is_grandfathered, ts.updated_at,
            (SELECT count(*) FROM clinic_contracted_modules m WHERE m.clinic_id = c.id) AS contracted,
            c.active_modules, c.flow_config
       FROM clinics c LEFT JOIN tenant_subscriptions ts ON ts.clinic_id = c.id
      WHERE c.id = ANY($1::uuid[])`,
    [[...FORBIDDEN_IDS]]
  )
  if (JSON.stringify(fb) !== JSON.stringify(fa[0])) {
    throw new Error('ABORT: estado da CLÍNICA CAT & DOG mudou dentro da transação. ' +
      `antes=${JSON.stringify(fb)} depois=${JSON.stringify(fa[0])}`)
  }
  const { rows: leak } = await c.query(
    `SELECT count(*)::int AS n FROM clinic_contracted_modules WHERE clinic_id = ANY($1)`,
    [[...FORBIDDEN_IDS]]
  )
  if (leak[0].n !== 0) throw new Error('ABORT: apareceram módulos contratados para a clínica proibida.')

  const { rows: totals } = await c.query(
    `SELECT clinic_id, count(*)::int AS n FROM clinic_contracted_modules
      WHERE is_active GROUP BY clinic_id ORDER BY clinic_id`
  )

  await c.query('COMMIT')

  console.log('COMMIT OK.')
  console.log(`  tenant_subscriptions atualizadas: ${subsTouched}`)
  console.log(`  clinic_contracted_modules gravadas/atualizadas: ${modsTouched}`)
  console.log('  contratados ativos por clínica:', JSON.stringify(totals))
  console.log('  CLÍNICA CAT & DOG: intacta (0 contratados, assinatura byte-a-byte igual).')
} catch (e) {
  await c.query('ROLLBACK').catch(() => {})
  console.error('ERRO (rollback):', e.message)
  process.exitCode = 1
} finally {
  await c.end()
}
