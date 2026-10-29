#!/usr/bin/env node
/**
 * Tarefa 0, item 9 — deixa a Conciliação de Convênios pronta para a Clínica
 * Animais testar com VETPLAN e AVA no banco DEV.
 *
 * A Animais NÃO usa Petlove. O que o sistema precisa para a tela abrir e operar:
 *   1. módulo `petlove_reconciliation` em clinics.active_modules (a tela é
 *      genérica desde a migration 0464; o nome do módulo é histórico);
 *   2. flow_config.usa_convenios = true;
 *   3. os convênios cadastrados em insurance_providers.
 *
 * Idempotente: não duplica provider já existente (casa por nome, sem
 * distinguir maiúsculas), e o módulo entra por união de array.
 * Credenciais SEMPRE do ambiente (.env.local) — nada hardcoded.
 *
 * Uso:  node scripts/seed-animais-convenios.mjs [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const ROOT = process.cwd()
const CLINIC_ID = process.env.ANIMAIS_CLINIC_ID ?? 'ad1c3fca-d264-42c3-9a11-4b7ddac52a72'
const DRY = process.argv.includes('--dry')

function loadEnv() {
  const out = { ...process.env }
  for (const f of ['.env.local', '.env.dev.local']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      const k = line.slice(0, i).trim()
      if (!out[k]) out[k] = line.slice(i + 1).trim()
    }
  }
  return out
}

const env = loadEnv()
if (!env.SUPABASE_DEV_DB_PASSWORD) {
  console.error('SUPABASE_DEV_DB_PASSWORD ausente no ambiente/.env.local. Abortando.')
  process.exit(1)
}

// receipt_mode conforme a 0464:
//   convenio_repasse → a clínica cobra do CONVÊNIO (tutor R$ 0) e concilia repasse.
//   ong_guia         → guia carimbada: "PAGA" (cobra da ONG) ou "ENCAMINHADA"
//                      (o tutor paga um valor intermediário).
const PROVIDERS = [
  {
    name: 'Vetplan',
    receipt_mode: 'convenio_repasse',
    plan_types: [],
    contact_info: {},
    config: {
      observacao: 'Fluxo confirmado no alinhamento de 21/09/2026. Faltam as siglas/planos para o de-para.',
      tabela_preco_origem: 'Tabela Preços Vetplan 21 09 26 (PDF do cliente, fora do repositório)',
      importacao_precos: 'pendente',
    },
  },
  {
    name: 'AVA',
    receipt_mode: 'ong_guia',
    plan_types: ['PAGA', 'ENCAMINHADA'],
    contact_info: {},
    config: {
      observacao: 'ONG com guia carimbada. "PAGA" cobra da AVA; "ENCAMINHADA" o tutor paga valor intermediário.',
      tabela_preco_origem: 'Tabela Preços Ava 21 09 26 / Tabela Ana Paga 21 09 26 (PDFs do cliente, fora do repositório)',
      importacao_precos: 'pendente',
    },
  },
]

const client = new pg.Client({
  host: env.SUPABASE_DEV_DB_HOST ?? 'aws-0-us-east-1.pooler.supabase.com',
  port: Number(env.SUPABASE_DEV_DB_PORT ?? 6543),
  user: env.SUPABASE_DEV_DB_USER ?? 'postgres.claqxwckiihknclhmzvf',
  password: env.SUPABASE_DEV_DB_PASSWORD,
  database: env.SUPABASE_DEV_DB_NAME ?? 'postgres',
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  const { rows } = await client.query('SELECT name, active_modules, flow_config FROM clinics WHERE id = $1', [CLINIC_ID])
  if (!rows.length) { console.error(`Clínica ${CLINIC_ID} não encontrada.`); process.exit(1) }
  console.log(`Clínica: ${rows[0].name}`)

  const mods = rows[0].active_modules ?? []
  const needsModule = !mods.includes('petlove_reconciliation')
  const needsFlag = rows[0].flow_config?.usa_convenios !== true
  console.log(`módulo petlove_reconciliation: ${needsModule ? 'FALTA (será adicionado)' : 'ok'}`)
  console.log(`flow_config.usa_convenios:      ${needsFlag ? 'FALTA (será ligado)' : 'ok'}`)

  if (DRY) {
    console.log('--dry: nada gravado. Convênios que seriam criados:', PROVIDERS.map(p => p.name).join(', '))
    process.exit(0)
  }

  if (needsModule) {
    await client.query(
      `UPDATE clinics
          SET active_modules = (SELECT array_agg(DISTINCT m) FROM unnest(COALESCE(active_modules,'{}') || ARRAY['petlove_reconciliation']) m)
        WHERE id = $1`, [CLINIC_ID])
  }
  if (needsFlag) {
    await client.query(
      `UPDATE clinics SET flow_config = COALESCE(flow_config,'{}'::jsonb) || '{"usa_convenios":true}'::jsonb WHERE id = $1`,
      [CLINIC_ID])
  }

  for (const p of PROVIDERS) {
    const found = await client.query(
      'SELECT id FROM insurance_providers WHERE clinic_id = $1 AND lower(name) = lower($2)', [CLINIC_ID, p.name])
    if (found.rows.length) {
      await client.query(
        `UPDATE insurance_providers
            SET receipt_mode = $2, plan_types = $3::jsonb, config = $4::jsonb, is_active = TRUE, updated_at = now()
          WHERE id = $1`,
        [found.rows[0].id, p.receipt_mode, JSON.stringify(p.plan_types), JSON.stringify(p.config)])
      console.log(`↻ ${p.name} atualizado (${found.rows[0].id})`)
    } else {
      const ins = await client.query(
        `INSERT INTO insurance_providers (clinic_id, name, plan_types, contact_info, is_active, receipt_mode, config)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, TRUE, $5, $6::jsonb) RETURNING id`,
        [CLINIC_ID, p.name, JSON.stringify(p.plan_types), JSON.stringify(p.contact_info), p.receipt_mode, JSON.stringify(p.config)])
      console.log(`+ ${p.name} criado (${ins.rows[0].id})`)
    }
  }

  const final = await client.query(
    'SELECT name, receipt_mode, is_active FROM insurance_providers WHERE clinic_id = $1 ORDER BY name', [CLINIC_ID])
  console.log('Convênios da clínica:', JSON.stringify(final.rows))
} finally {
  await client.end()
}
