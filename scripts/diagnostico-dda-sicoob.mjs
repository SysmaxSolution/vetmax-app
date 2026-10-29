// Diagnóstico do DDA no Sicoob: separa o que é NOSSO (escopo do token, dados
// enviados) do que é DO BANCO (produto de pagamento ativo na conta).
//
// Faz duas chamadas reais, ambas de LEITURA:
//   1. POST no token com os escopos de pagamento — mostra quais o Keycloak
//      concedeu de fato.
//   2. GET /boletos (varredura DDA) — mostra status HTTP e corpo cru.
//
// Nada é gravado em banco nenhum. Credencial e certificado saem da própria
// configuração da clínica em produção, como a aplicação faz.
//
// Uso: node scripts/diagnostico-dda-sicoob.mjs --clinica "Animais Diagnóstico por Imagem"
import pg from 'pg'
import https from 'node:https'
import { readFileSync } from 'node:fs'
import { createDecipheriv, scryptSync } from 'node:crypto'

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null }
const nomeClinica = arg('clinica') ?? 'Animais Diagnóstico por Imagem'

const env = readFileSync('C:/SysMax/.env.local', 'utf8')
const get = k => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')

// mesma derivação de src/lib/integrations/bank-certificate.ts
const chave = () => scryptSync(
  get('BANK_CERT_SECRET') || get('SUPABASE_SERVICE_ROLE_KEY') || 'sysvet-dev-fallback',
  'sysvet-bankcert-v1', 32)
function decifrar(enc) {
  if (!enc) return null
  const buf = Buffer.from(enc, 'base64')
  const d = createDecipheriv('aes-256-gcm', chave(), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()])
}

const TOKEN_URL = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'
const PROD_BASE = 'https://api.sicoob.com.br/pagamentos/v3'
const ESCOPOS = 'pagamentos_inclusao pagamentos_consulta pagamentos_alteracao'

function requisicao(url, { metodo = 'GET', corpo = null, headers = {}, pfx, senha }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: metodo,
      pfx, passphrase: senha ?? undefined, rejectUnauthorized: true, headers,
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    req.on('error', reject)
    if (corpo) req.write(corpo)
    req.end()
  })
}

const c = new pg.Client({ connectionString: get('DATABASE_URL'), ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query('BEGIN TRANSACTION READ ONLY')

const { rows: cl } = await c.query(
  `select id, name from clinics where lower(name) = lower($1)`, [nomeClinica])
if (cl.length !== 1) { console.error('clinica ambigua ou inexistente:', cl.length); process.exit(1) }
const clinicId = cl[0].id
console.log('clinica:', cl[0].name)

const { rows: acc } = await c.query(`
  select agency, account, bank_code, name from bank_accounts
   where clinic_id = $1 and bank_code = '756' order by is_default desc limit 1`, [clinicId])
if (!acc.length) { console.error('nenhuma conta Sicoob'); process.exit(1) }
const conta = acc[0]
const numeroConta = Number(String(conta.account ?? '').replace(/\D/g, ''))
const agencia = Number(String(conta.agency ?? '').replace(/\D/g, ''))
console.log(`conta: ${conta.name} | agencia=${agencia} | numeroConta=${numeroConta} (de "${conta.account}")`)

const { rows: integ } = await c.query(
  `select bank_enabled, banks from clinic_bank_integrations where clinic_id = $1`, [clinicId])
if (!integ.length || integ[0].bank_enabled !== true) { console.error('integracao bancaria desativada'); process.exit(1) }
const banco = (integ[0].banks || []).find(b => String(b.bank_code ?? '').replace(/\D/g, '') === '756')
  ?? (integ[0].banks || [])[0]
console.log(`ambiente: ${banco?.environment} | client_id: ...${String(banco?.client_id ?? '').slice(-6)}`)
if (banco?.environment !== 'production') { console.error('nao esta em producao — abortando'); process.exit(1) }

const { rows: cert } = await c.query(`
  select pfx_encrypted, passphrase_encrypted, not_after from clinic_bank_certificates
   where clinic_id = $1 and bank_code = '756'`, [clinicId])
if (!cert.length) { console.error('sem certificado'); process.exit(1) }
const pfx = decifrar(cert[0].pfx_encrypted)
const senha = decifrar(cert[0].passphrase_encrypted)?.toString('utf8') ?? undefined
console.log(`certificado: ${pfx ? pfx.length + ' bytes' : 'FALHOU decifrar'} | vence ${String(cert[0].not_after).slice(0,10)}`)

await c.query('COMMIT'); await c.end()

// ── 1) TOKEN: quais escopos o banco concede? ────────────────────────────────
console.log('\n=== 1) TOKEN (escopos de pagamento) ===')
const corpo = new URLSearchParams({
  grant_type: 'client_credentials', client_id: banco.client_id, scope: ESCOPOS,
}).toString()
const rt = await requisicao(TOKEN_URL, {
  metodo: 'POST', corpo, pfx, senha,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpo) },
})
console.log('status:', rt.status)
let token = null
try {
  const j = JSON.parse(rt.body)
  if (j.access_token) {
    token = j.access_token
    console.log('escopos PEDIDOS  :', ESCOPOS)
    console.log('escopos CONCEDIDOS:', JSON.stringify(j.scope))
    const concedidos = String(j.scope ?? '').split(/\s+/).filter(Boolean)
    const faltando = ESCOPOS.split(' ').filter(e => !concedidos.includes(e))
    console.log(faltando.length
      ? '  >> FALTAM no token: ' + faltando.join(', ') + '  (problema NOSSO/do app no portal)'
      : '  >> todos os escopos de pagamento concedidos (app no portal esta certo)')
    // o token carrega o que o banco sabe do cooperado
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))
    const interessa = ['preferred_username','cooperativa','conta','cnpj','cpf','clientId','azp','sub']
    console.log('  claims do token:', JSON.stringify(Object.fromEntries(
      Object.entries(payload).filter(([k]) => interessa.includes(k)))))
  } else {
    console.log('corpo:', rt.body.slice(0, 400))
  }
} catch { console.log('corpo nao-JSON:', rt.body.slice(0, 300)) }

if (!token) { console.error('\nsem token — nao da para seguir'); process.exit(1) }

// ── 2) DDA: o produto esta ativo na conta? ──────────────────────────────────
console.log('\n=== 2) VARREDURA DDA (GET /boletos) ===')
const hoje = new Date()
const ini = new Date(hoje.getTime() - 15 * 86400000).toISOString().slice(0, 10)
const fim = new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10)

for (const tentativa of [
  { rotulo: 'numeroConta COM digito (o que o app manda hoje)', conta: numeroConta },
  { rotulo: 'numeroConta SEM o digito verificador',            conta: Number(String(numeroConta).slice(0, -1)) },
]) {
  const q = new URLSearchParams({
    numeroConta: String(tentativa.conta), dataInicial: ini, dataFinal: fim,
    situacao: '1', tipoData: '1',
  })
  const r = await requisicao(`${PROD_BASE}/boletos?${q}`, {
    pfx, senha,
    headers: { Authorization: `Bearer ${token}`, client_id: banco.client_id, Accept: 'application/json' },
  })
  console.log(`\n-- ${tentativa.rotulo} (numeroConta=${tentativa.conta})`)
  console.log('   status:', r.status)
  console.log('   corpo :', r.body.slice(0, 500))
}
