// Mostra TODOS os campos que a varredura DDA do Sicoob devolve, para decidir
// o que dá para aproveitar no cadastro automático de fornecedor.
// Somente leitura. Não imprime a conta inteira nem dado além do necessário.
import pg from 'pg'
import https from 'node:https'
import { readFileSync } from 'node:fs'
import { createDecipheriv, scryptSync } from 'node:crypto'

const env = readFileSync('C:/SysMax/.env.local', 'utf8')
const get = k => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')
const chave = () => scryptSync(
  get('BANK_CERT_SECRET') || get('SUPABASE_SERVICE_ROLE_KEY') || 'sysvet-dev-fallback',
  'sysvet-bankcert-v1', 32)
const dec = e => {
  const b = Buffer.from(e, 'base64')
  const d = createDecipheriv('aes-256-gcm', chave(), b.subarray(0, 12))
  d.setAuthTag(b.subarray(12, 28))
  return Buffer.concat([d.update(b.subarray(28)), d.final()])
}

const c = new pg.Client({ connectionString: get('DATABASE_URL'), ssl: { rejectUnauthorized: false } })
await c.connect(); await c.query('BEGIN TRANSACTION READ ONLY')
const { rows: cl } = await c.query(
  `select id from clinics where lower(name) = lower('Animais Diagnóstico por Imagem')`)
const { rows: ig } = await c.query(`select banks from clinic_bank_integrations where clinic_id=$1`, [cl[0].id])
const banco = (ig[0].banks || []).find(b => String(b.bank_code ?? '').replace(/\D/g, '') === '756')
const { rows: ct } = await c.query(
  `select pfx_encrypted, passphrase_encrypted from clinic_bank_certificates where clinic_id=$1 and bank_code='756'`, [cl[0].id])
const pfx = dec(ct[0].pfx_encrypted), senha = dec(ct[0].passphrase_encrypted)?.toString('utf8')
const { rows: acc } = await c.query(
  `select account from bank_accounts where clinic_id=$1 and bank_code='756' order by is_default desc limit 1`, [cl[0].id])
const CONTA = Number(String(acc[0].account).replace(/\D/g, ''))
await c.query('COMMIT'); await c.end()

const req = (url, headers = {}, metodo = 'GET', corpo = null) => new Promise((res, rej) => {
  const u = new URL(url)
  const r = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method: metodo,
    pfx, passphrase: senha, rejectUnauthorized: true, headers },
    s => { let d = ''; s.on('data', x => d += x); s.on('end', () => res({ status: s.statusCode, body: d })) })
  r.on('error', rej); if (corpo) r.write(corpo); r.end()
})

const corpoTok = new URLSearchParams({ grant_type: 'client_credentials', client_id: banco.client_id,
  scope: 'pagamentos_inclusao pagamentos_consulta pagamentos_alteracao' }).toString()
const rt = await req('https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token', {
  'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpoTok) }, 'POST', corpoTok)
const token = JSON.parse(rt.body).access_token

const hoje = new Date()
const ini = new Date(hoje.getTime() - 15 * 86400000).toISOString().slice(0, 10)
const fim = new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10)
const q = new URLSearchParams({ numeroConta: String(CONTA), dataInicial: ini, dataFinal: fim,
  situacao: '1', tipoData: '1' })
const r = await req(`https://api.sicoob.com.br/pagamentos/v3/boletos?${q}`,
  { Authorization: `Bearer ${token}`, client_id: banco.client_id, Accept: 'application/json' })

if (r.status !== 200) { console.error('status ' + r.status + ' -> ' + r.body.slice(0, 400)); process.exit(1) }
const j = JSON.parse(r.body)
const lista = j.resultado ?? j.boletos ?? []
console.log(`status ${r.status} | ${lista.length} boleto(s) no DDA (${ini} a ${fim})\n`)
if (!lista.length) process.exit(0)

console.log('=== TODOS OS CAMPOS do 1º registro ===')
for (const [k, v] of Object.entries(lista[0])) {
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  console.log('  ' + k.padEnd(34) + ' = ' + s.slice(0, 70))
}

console.log('\n=== o que interessa para CADASTRO DE FORNECEDOR, por boleto ===')
for (const b of lista.slice(0, 8)) {
  console.log([
    b.numeroCpfCnpjBeneficiario, '|',
    String(b.nomeRazaoSocialBeneficiario ?? '').slice(0, 42).padEnd(42), '|',
    'venc', b.dataVencimento ?? '?', '|',
    'R$', b.valor ?? b.valorNominal ?? '?',
  ].join(' '))
}

const cnpjs = new Set(lista.map(b => b.numeroCpfCnpjBeneficiario).filter(Boolean))
console.log(`\nfornecedores distintos no período: ${cnpjs.size} (em ${lista.length} boletos)`)
