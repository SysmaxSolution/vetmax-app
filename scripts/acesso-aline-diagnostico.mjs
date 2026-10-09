// Inclui a Aline em "Animais Diagnostico por Imagem" SEM tirar o acesso que
// ela ja tem em "Animais Clinica Veterinaria".
//
// O seletor de clinica (src/lib/actions/clinic-switcher.ts) lista, para
// usuario normal, o que estiver em `user_clinics` cuja clinica esteja
// `active` — e `switchClinic` valida o vinculo antes de trocar. Entao uma
// linha aqui e exatamente o que falta.
//
// Uso: node scripts/acesso-aline-diagnostico.mjs [--confirmar] [--remover]
import pg from 'pg'
import { readFileSync } from 'node:fs'

const confirmar = process.argv.includes('--confirmar')
const remover   = process.argv.includes('--remover')

const env = readFileSync('C:/SysMax/.env.local', 'utf8')
const get = k => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')
const c = new pg.Client({ connectionString: get('DATABASE_URL'), ssl: { rejectUnauthorized: false } })
await c.connect()

try {
  await c.query('BEGIN')

  const { rows: cl } = await c.query(
    `select id, name, status from clinics where lower(name) = lower($1)`,
    ['Animais Diagnóstico por Imagem'])
  if (cl.length !== 1) throw new Error('clinica nao encontrada ou ambigua: ' + cl.length)
  if (cl[0].status !== 'active') throw new Error('clinica nao esta active — o seletor nao vai listar')

  // Pessoa pelo NOME COMPLETO, abortando se houver mais de uma.
  const { rows: p } = await c.query(
    `select id, full_name from profiles where upper(full_name) like '%ALINE APARECIDA BALDUINO%'`)
  if (p.length !== 1) throw new Error(`esperava 1 Aline, achei ${p.length}`)
  console.log('pessoa:', p[0].full_name, '| clinica:', cl[0].name)

  if (remover) {
    const r = await c.query(
      `delete from user_clinics where user_id = $1 and clinic_id = $2`, [p[0].id, cl[0].id])
    console.log('vinculos removidos:', r.rowCount)
  } else {
    const r = await c.query(`
      insert into user_clinics (user_id, clinic_id, role) values ($1, $2, 'admin')
      on conflict (user_id, clinic_id) do nothing`, [p[0].id, cl[0].id])
    console.log('vinculo criado:', r.rowCount, r.rowCount === 0 ? '(ja existia)' : '')
  }

  // Confere o que a pessoa passa a ver, dentro da mesma transacao.
  const { rows: fim } = await c.query(`
    select c.name clinica, uc.role from user_clinics uc
      join clinics c on c.id = uc.clinic_id
     where uc.user_id = $1 and c.status = 'active' order by c.name`, [p[0].id])
  console.log('clinicas que ela vera no seletor:')
  console.table(fim)

  if (!confirmar) { await c.query('ROLLBACK'); console.log('\nENSAIO — nada gravado. Repita com --confirmar.') }
  else            { await c.query('COMMIT');   console.log('\nCOMMIT.') }
} catch (e) {
  await c.query('ROLLBACK')
  console.error('\nROLLBACK, nada gravado:', e.message)
  process.exitCode = 1
} finally { await c.end() }
