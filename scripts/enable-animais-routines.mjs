#!/usr/bin/env node
/**
 * Tarefa 0 — liga no banco DEV as flags das rotinas que a Clínica Animais já
 * está testando, para que a criação das flags próprias (padrão DESLIGADO) não
 * derrube o que já está em uso no ambiente de testes.
 *
 * Idempotente: faz merge em clinics.flow_config (jsonb ||), nunca substitui.
 * Credenciais SEMPRE do ambiente (.env.local do worktree) — nada hardcoded.
 *
 * Uso:  node scripts/enable-animais-routines.mjs [--dry]
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
const password = env.SUPABASE_DEV_DB_PASSWORD
if (!password) {
  console.error('SUPABASE_DEV_DB_PASSWORD ausente no ambiente/.env.local. Abortando.')
  process.exit(1)
}

// Rotinas que a Animais já usa no dev e que passaram a exigir flag própria.
const FLAGS = {
  usa_imagem: true,       // módulo de Imagem/DICOM
  usa_laboratorio: true,  // painel de resultados dentro do exame
  usa_boleto: true,       // aba Boletos no Financeiro
  portal_enabled: true,   // Portal do Tutor (menu + rota + login)
  usa_convenios: true,    // conciliação de convênios (Vetplan/AVA)
}
// NÃO ligamos vaccine_recall_enabled: envia WhatsApp aos tutores e precisa de
// decisão explícita da clínica (LGPD). Padrão continua desligado.

const client = new pg.Client({
  host: env.SUPABASE_DEV_DB_HOST ?? 'aws-0-us-east-1.pooler.supabase.com',
  port: Number(env.SUPABASE_DEV_DB_PORT ?? 6543),
  user: env.SUPABASE_DEV_DB_USER ?? 'postgres.claqxwckiihknclhmzvf',
  password,
  database: env.SUPABASE_DEV_DB_NAME ?? 'postgres',
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  const before = await client.query('SELECT name, flow_config FROM clinics WHERE id = $1', [CLINIC_ID])
  if (!before.rows.length) {
    console.error(`Clínica ${CLINIC_ID} não encontrada no banco dev.`)
    process.exit(1)
  }
  console.log(`Clínica: ${before.rows[0].name}`)
  console.log('flow_config ANTES:', JSON.stringify(before.rows[0].flow_config))

  if (DRY) {
    console.log('--dry: nada gravado. Flags que seriam ligadas:', JSON.stringify(FLAGS))
    process.exit(0)
  }

  const after = await client.query(
    `UPDATE clinics
        SET flow_config = COALESCE(flow_config, '{}'::jsonb) || $2::jsonb
      WHERE id = $1
      RETURNING flow_config`,
    [CLINIC_ID, JSON.stringify(FLAGS)],
  )
  console.log('flow_config DEPOIS:', JSON.stringify(after.rows[0].flow_config))
} finally {
  await client.end()
}
