// Publica uma nova versão do agente-ponte. A partir daqui, todo agente pareado
// baixa, confere o hash e se atualiza sozinho no próximo heartbeat — ninguém
// precisa entrar por AnyDesk na clínica.
//
//   node scripts/publish-lab-agent.mjs                 # lista as releases
//   node scripts/publish-lab-agent.mjs --publish       # publica a versão do arquivo
//   node scripts/publish-lab-agent.mjs --current 2026.10.01
//   node scripts/publish-lab-agent.mjs --pin <agente> 2026.10.01   # segura um agente
//   node scripts/publish-lab-agent.mjs --unpin <agente>
//
// A versão sai do próprio agent.mjs (const VERSION). Publicar duas vezes a
// mesma versão com código diferente é recusado — versão é contrato.

import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { config } from 'dotenv'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })

const AGENT = process.env.LAB_AGENT_FILE ?? 'C:/SysMax/lab-agent/agent.mjs'
const argv = process.argv.slice(2)
const arg = (nome) => (argv.includes(nome) ? argv[argv.indexOf(nome) + 1] : null)

if (!process.env.SUPABASE_DEV_DB_PASSWORD) {
  console.error('Falta SUPABASE_DEV_DB_PASSWORD no .env.local'); process.exit(1)
}

const client = new pg.Client({
  host:     process.env.SUPABASE_DEV_DB_HOST ?? 'aws-0-us-east-1.pooler.supabase.com',
  port:     Number(process.env.SUPABASE_DEV_DB_PORT ?? 6543),
  user:     process.env.SUPABASE_DEV_DB_USER ?? 'postgres.claqxwckiihknclhmzvf',
  password: process.env.SUPABASE_DEV_DB_PASSWORD,
  database: process.env.SUPABASE_DEV_DB_NAME ?? 'postgres',
  ssl: { rejectUnauthorized: false },
})

function lerAgente() {
  const source = readFileSync(AGENT, 'utf8')
  const m = source.match(/^const VERSION = '([^']+)'/m)
  if (!m) { console.error(`Não achei "const VERSION = '…'" em ${AGENT}`); process.exit(1) }
  return { source, version: m[1], sha256: createHash('sha256').update(source, 'utf8').digest('hex') }
}

async function listar(q) {
  const { rows } = await q(`select version, sha256, is_current, length(source) bytes,
                                   to_char(created_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI') quando, notes
                              from lab_agent_releases order by created_at desc limit 15`)
  console.log('\nReleases publicadas:')
  for (const r of rows) {
    console.log(`  ${r.is_current ? '→' : ' '} ${String(r.version).padEnd(16)} ${r.sha256.slice(0, 12)}…  ${String(r.bytes).padStart(6)} B  ${r.quando}${r.notes ? '  · ' + r.notes : ''}`)
  }
  if (!rows.length) console.log('  (nenhuma)')

  const { rows: ag } = await q(`select a.label, c.name clinica, a.agent_version, a.auto_update, a.pinned_version,
                                       to_char(a.last_seen_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI') visto,
                                       a.last_update_error
                                  from lab_agents a left join clinics c on c.id = a.clinic_id
                                 order by a.last_seen_at desc nulls last`)
  console.log('\nAgentes:')
  for (const r of ag) {
    const trava = r.pinned_version ? ` [preso em ${r.pinned_version}]` : (r.auto_update ? '' : ' [auto-update OFF]')
    console.log(`  ${String(r.label).padEnd(18)} v${r.agent_version ?? '?'}${trava}  visto ${r.visto ?? 'NUNCA'}  · ${r.clinica ?? '—'}`)
    if (r.last_update_error) console.log(`      ! última atualização falhou: ${r.last_update_error}`)
  }
}

async function main() {
  await client.connect()
  const q = (sql, p) => client.query(sql, p)

  if (argv.includes('--publish')) {
    const { source, version, sha256 } = lerAgente()
    const { rows: ja } = await q('select sha256 from lab_agent_releases where version=$1', [version])
    if (ja[0] && ja[0].sha256 !== sha256) {
      console.error(`\nA versão ${version} já existe com OUTRO conteúdo.`)
      console.error('Suba a const VERSION em agent.mjs — versão publicada é contrato, não se reescreve.')
      await client.end(); process.exit(1)
    }
    await q(`insert into lab_agent_releases (version, sha256, source, notes, is_current)
             values ($1,$2,$3,$4,false)
             on conflict (version) do update set source = excluded.source, notes = coalesce(excluded.notes, lab_agent_releases.notes)`,
            [version, sha256, source, arg('--notes')])
    await q('update lab_agent_releases set is_current = (version = $1)', [version])
    console.log(`\n✓ versão ${version} publicada e marcada como corrente (${source.length} B · sha256 ${sha256.slice(0, 12)}…)`)
    console.log('  Os agentes pareados vão baixar sozinhos no próximo heartbeat (até 60 s).')
  } else if (arg('--current')) {
    const v = arg('--current')
    const { rowCount } = await q('update lab_agent_releases set is_current = (version = $1)', [v])
    console.log(rowCount ? `✓ versão corrente agora é ${v}` : 'nenhuma release encontrada')
  } else if (arg('--pin')) {
    const label = arg('--pin')
    const v = argv[argv.indexOf('--pin') + 2]
    await q('update lab_agents set pinned_version=$2 where label=$1', [label, v ?? null])
    console.log(`✓ agente "${label}" preso na versão ${v}`)
  } else if (arg('--unpin')) {
    await q('update lab_agents set pinned_version=null where label=$1', [arg('--unpin')])
    console.log(`✓ agente "${arg('--unpin')}" volta a seguir a release corrente`)
  }

  await listar(q)
  await client.end()
}

main().catch(async e => { console.error(e); try { await client.end() } catch {} ; process.exit(1) })
