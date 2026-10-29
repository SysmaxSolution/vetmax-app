// Valida a ponta externa da automação: a consulta pública de CNPJ resolve os
// fornecedores REAIS que o DDA da clínica devolve?
//
// Se falhar, a feature não quebra — ela degrada para o nome truncado do banco.
// Mas é melhor descobrir isso agora do que a Bruna descobrir cadastrando.
//
// Leitura pura: consulta o DDA em produção e a API pública de CNPJ. Não grava
// nada, em banco nenhum.
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

// ── credencial da clínica ───────────────────────────────────────────────────
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

const req = (url, headers = {}, metodo = 'GET', corpo = null, usarCert = true) => new Promise(res => {
  const u = new URL(url)
  const opts = { hostname: u.hostname, port: 443, path: u.pathname + u.search, method: metodo,
                 rejectUnauthorized: true, headers }
  if (usarCert) { opts.pfx = pfx; opts.passphrase = senha }
  const r = https.request(opts, s => { let d = ''; s.on('data', x => d += x); s.on('end', () => res({ status: s.statusCode, body: d })) })
  r.on('error', e => res({ status: 0, body: String(e.message) }))
  if (corpo) r.write(corpo); r.end()
})

// ── DDA real ────────────────────────────────────────────────────────────────
const corpoTok = new URLSearchParams({ grant_type: 'client_credentials', client_id: banco.client_id,
  scope: 'pagamentos_inclusao pagamentos_consulta pagamentos_alteracao' }).toString()
const rt = await req('https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token',
  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpoTok) }, 'POST', corpoTok)
const token = JSON.parse(rt.body).access_token

const hoje = new Date()
const q = new URLSearchParams({
  numeroConta: String(CONTA),
  dataInicial: new Date(hoje.getTime() - 15 * 86400000).toISOString().slice(0, 10),
  dataFinal:   new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10),
  situacao: '1', tipoData: '1',
})
const r = await req(`https://api.sicoob.com.br/pagamentos/v3/boletos?${q}`,
  { Authorization: `Bearer ${token}`, client_id: banco.client_id, Accept: 'application/json' })
if (r.status !== 200) { console.error('DDA falhou:', r.status, r.body.slice(0, 200)); process.exit(1) }

const lista = JSON.parse(r.body).resultado ?? []
const porDoc = new Map()
for (const b of lista) {
  const doc = String(b.numeroCpfCnpjBeneficiario ?? '').replace(/\D/g, '')
  if (doc.length !== 14) continue
  const a = porDoc.get(doc) ?? { nome: b.nomeRazaoSocialBeneficiario ?? '', n: 0 }
  a.n++; porDoc.set(doc, a)
}
console.log(`DDA: ${lista.length} boletos, ${porDoc.size} fornecedores distintos\n`)

// ── consulta pública, um por um (mesma ordem do nosso lookupCnpj) ───────────
const buscar = async doc => {
  let x = await req(`https://publica.cnpj.ws/cnpj/${doc}`, { Accept: 'application/json' }, 'GET', null, false)
  if (x.status === 200) {
    try { const j = JSON.parse(x.body); if (j.razao_social) return { fonte: 'cnpj.ws', nome: j.razao_social } } catch {}
  }
  x = await req(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, { Accept: 'application/json' }, 'GET', null, false)
  if (x.status === 200) {
    try { const j = JSON.parse(x.body); if (j.razao_social) return { fonte: 'brasilapi', nome: j.razao_social } } catch {}
  }
  return { fonte: null, nome: null, status: x.status }
}

let ok = 0, falhou = 0, ganharamNome = 0
for (const [doc, info] of porDoc) {
  const res = await buscar(doc)
  const truncado = info.nome.length >= 39
  if (res.nome) {
    ok++
    if (res.nome.trim() !== info.nome.trim()) ganharamNome++
    console.log(`✓ ${doc}  [${res.fonte}]`)
    console.log(`    banco:   "${info.nome}"${truncado ? '   <-- TRUNCADO' : ''}`)
    console.log(`    receita: "${res.nome}"`)
  } else {
    falhou++
    console.log(`✗ ${doc}  consulta falhou (status ${res.status}) — usaria "${info.nome}"`)
  }
  await new Promise(r => setTimeout(r, 1200))   // respeita limite de taxa
}

console.log(`\nresolvidos pela consulta publica: ${ok}/${porDoc.size}`)
console.log(`falharam (cairiam no nome do banco): ${falhou}`)
console.log(`nome melhorou em relacao ao do banco: ${ganharamNome}`)
