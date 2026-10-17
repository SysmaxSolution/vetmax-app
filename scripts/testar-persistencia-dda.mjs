// Prova a regra pedida: reabrir o período NÃO duplica e NÃO perde o trabalho.
//
// Simula o ciclo real da Bruna no banco de TESTES:
//   1. consulta o período (grava)
//   2. lança um boleto e ignora outro (estado do trabalho)
//   3. consulta o MESMO período de novo (o caso que duplicava na conciliação)
//   4. confere: nenhuma duplicata e o estado intacto
//
// Usa os boletos REAIS do DDA de produção como matéria-prima (só leitura lá),
// mas grava exclusivamente no banco de testes.
import pg from 'pg'
import https from 'node:https'
import { createHash, createDecipheriv, scryptSync } from 'node:crypto'
import { readFileSync } from 'node:fs'

const get = (e, k) => (e.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')
const prodEnv = readFileSync('C:/SysMax/.env.local', 'utf8')
const devEnv  = readFileSync('C:/SysMax/.env.dev.local', 'utf8')

// mesma regra de src/lib/financial/dda-digital.ts
const soDig = v => String(v ?? '').replace(/\D/g, '')
function digital(clinicId, b, raw) {
  const cip = soDig(raw.numeroIdentificadorBoletoCip)
  if (cip) return `cip:${cip}`
  const cb = soDig(b.barcode ?? raw.numeroCodigoBarras)
  if (cb.length >= 44) return `cb:${cb}`
  return 'h:' + createHash('md5').update([clinicId, soDig(b.beneficiary_doc),
    (b.beneficiary ?? '').trim().toUpperCase(), Number(b.amount ?? 0).toFixed(2),
    b.due_date ?? '', b.document ?? ''].join('|')).digest('hex')
}

// ── busca os boletos reais em produção (leitura) ────────────────────────────
const chave = () => scryptSync(get(prodEnv, 'BANK_CERT_SECRET') || get(prodEnv, 'SUPABASE_SERVICE_ROLE_KEY') || 'sysvet-dev-fallback', 'sysvet-bankcert-v1', 32)
const dec = e => { const b = Buffer.from(e, 'base64'); const d = createDecipheriv('aes-256-gcm', chave(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]) }

const cp = new pg.Client({ connectionString: get(prodEnv, 'DATABASE_URL'), ssl: { rejectUnauthorized: false } })
await cp.connect(); await cp.query('BEGIN TRANSACTION READ ONLY')
const { rows: cl } = await cp.query(`select id from clinics where lower(name)=lower('Animais Diagnóstico por Imagem')`)
const { rows: ig } = await cp.query(`select banks from clinic_bank_integrations where clinic_id=$1`, [cl[0].id])
const banco = (ig[0].banks || []).find(b => soDig(b.bank_code) === '756')
const { rows: ct } = await cp.query(`select pfx_encrypted, passphrase_encrypted from clinic_bank_certificates where clinic_id=$1 and bank_code='756'`, [cl[0].id])
const pfx = dec(ct[0].pfx_encrypted), senha = dec(ct[0].passphrase_encrypted)?.toString('utf8')
const { rows: acc } = await cp.query(`select account from bank_accounts where clinic_id=$1 and bank_code='756' order by is_default desc limit 1`, [cl[0].id])
const CONTA = Number(soDig(acc[0].account))
await cp.query('COMMIT'); await cp.end()

const req = (url, headers = {}, metodo = 'GET', corpo = null) => new Promise(res => {
  const u = new URL(url)
  const r = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method: metodo,
    pfx, passphrase: senha, rejectUnauthorized: true, headers },
    s => { let d = ''; s.on('data', x => d += x); s.on('end', () => res({ status: s.statusCode, body: d })) })
  r.on('error', e => res({ status: 0, body: String(e.message) })); if (corpo) r.write(corpo); r.end()
})
const tk = new URLSearchParams({ grant_type: 'client_credentials', client_id: banco.client_id,
  scope: 'pagamentos_inclusao pagamentos_consulta pagamentos_alteracao' }).toString()
const rt = await req('https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token',
  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tk) }, 'POST', tk)
const hoje = new Date()
const q = new URLSearchParams({ numeroConta: String(CONTA),
  dataInicial: new Date(hoje - 15 * 86400000).toISOString().slice(0, 10),
  dataFinal: new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10),
  situacao: '1', tipoData: '1' })
const rr = await req(`https://api.sicoob.com.br/pagamentos/v3/boletos?${q}`,
  { Authorization: `Bearer ${JSON.parse(rt.body).access_token}`, client_id: banco.client_id, Accept: 'application/json' })
const brutos = JSON.parse(rr.body).resultado ?? []
console.log(`matéria-prima: ${brutos.length} boletos reais do DDA\n`)

const boletos = brutos.map(r => ({
  barcode: r.numeroCodigoBarras ?? null, document: r.numeroDocumento ?? null,
  beneficiary: r.nomeRazaoSocialBeneficiario ?? null, beneficiary_doc: r.numeroCpfCnpjBeneficiario ?? null,
  amount: r.valorBoleto ?? null, due_date: r.dataVencimentoBoleto ?? null, raw: r,
}))

// ── ciclo no banco de TESTES ────────────────────────────────────────────────
const cd = new pg.Client({ host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543,
  user: 'postgres.claqxwckiihknclhmzvf', password: get(devEnv, 'SUPABASE_DEV_DB_PASSWORD'),
  database: 'postgres', ssl: { rejectUnauthorized: false } })
await cd.connect()
const { rows: cld } = await cd.query(`select id from clinics where lower(name)=lower('Animais Clínica Veterinária')`)
const CLI = cld[0].id

const gravar = async () => {
  let n = 0
  for (const b of boletos) {
    const r = await cd.query(`
      insert into dda_boletos (clinic_id, fingerprint, barcode, document, beneficiary,
                               beneficiary_doc, amount, due_date, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (clinic_id, fingerprint) do nothing`,
      [CLI, digital(CLI, b, b.raw), b.barcode, b.document, b.beneficiary,
       b.beneficiary_doc, b.amount, b.due_date, b.raw])
    n += r.rowCount
  }
  return n
}
const contar = async () => (await cd.query(
  `select count(*)::int n, count(*) filter (where launched_at is not null)::int lancados,
          count(*) filter (where dismissed_at is not null)::int ignorados
     from dda_boletos where clinic_id=$1`, [CLI])).rows[0]

try {
  await cd.query('BEGIN')
  await cd.query(`delete from dda_boletos where clinic_id=$1`, [CLI])

  console.log('1) primeira consulta do período')
  console.log('   gravados:', await gravar(), '|', JSON.stringify(await contar()))

  console.log('2) a operadora lança um e ignora outro')
  const { rows: ids } = await cd.query(`select id from dda_boletos where clinic_id=$1 order by due_date limit 2`, [CLI])
  await cd.query(`update dda_boletos set launched_at=now() where id=$1`, [ids[0].id])
  await cd.query(`update dda_boletos set dismissed_at=now(), dismissed_reason='teste' where id=$1`, [ids[1].id])
  console.log('  ', JSON.stringify(await contar()))

  console.log('3) reabre o MESMO período (o caso que duplicava na conciliação)')
  const novos = await gravar()
  const fim = await contar()
  console.log('   gravados nesta segunda vez:', novos, '|', JSON.stringify(fim))

  console.log('\n--- veredito ---')
  const okDup = novos === 0 && fim.n === boletos.length
  const okEstado = fim.lancados === 1 && fim.ignorados === 1
  console.log(okDup    ? `✓ nenhuma duplicata (${fim.n} linhas para ${boletos.length} boletos)` : `✗ DUPLICOU: ${fim.n} linhas`)
  console.log(okEstado ? '✓ estado do trabalho preservado (1 lançado, 1 ignorado)' : '✗ estado PERDIDO')

  await cd.query('ROLLBACK')   // teste não deixa resíduo
  console.log('\nROLLBACK — banco de testes limpo.')
  if (!okDup || !okEstado) process.exitCode = 1
} catch (e) {
  await cd.query('ROLLBACK'); console.error('erro:', e.message); process.exitCode = 1
} finally { await cd.end() }
