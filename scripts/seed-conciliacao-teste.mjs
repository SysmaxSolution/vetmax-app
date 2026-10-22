// Semeia titulos de TESTE de conciliacao bancaria, derivados do extrato REAL
// da clinica escolhida — valores e datas saem das proprias linhas do extrato,
// senao nada casaria.
//
// Uso:
//   node scripts/seed-conciliacao-teste.mjs --clinica "Animais Diagnostico por Imagem"
//   node scripts/seed-conciliacao-teste.mjs --clinica "..." --remover
//
// Flags:
//   --banco prod|dev   (padrao: dev — producao exige dizer explicitamente)
//   --remover          apaga tudo que este script criou e sai
//   --confirmar        sem isso, so mostra o que faria (ensaio)
//
// O marcador vai em `notes`, nao na descricao: o Diretor pediu para inserir
// "normalmente", e a clinica esta em implantacao — os dados serao limpos antes
// da migracao. A descricao fica igual a do extrato, como ficaria num titulo
// real lancado pela tela. E por este marcador que --remover acha o que apagar;
// nao mude um sem mudar o outro.
const MARCADOR = 'TESTE-CONCILIACAO'

import pg from 'pg'
import { readFileSync, writeFileSync } from 'node:fs'

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null }
const tem = n => process.argv.includes('--' + n)

const nomeClinica = arg('clinica')
const alvo        = (arg('banco') ?? 'dev').toLowerCase()
const remover     = tem('remover')
const confirmar   = tem('confirmar')

if (!nomeClinica) { console.error('Falta --clinica "<nome exato>"'); process.exit(1) }
if (!['prod', 'dev'].includes(alvo)) { console.error('--banco deve ser prod ou dev'); process.exit(1) }

const get = (env, k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')
const conexao = alvo === 'prod'
  ? { connectionString: get(readFileSync('C:/SysMax/.env.local', 'utf8'), 'DATABASE_URL'),
      ssl: { rejectUnauthorized: false } }
  : { host: 'aws-0-us-east-1.pooler.supabase.com', port: 6543,
      user: 'postgres.claqxwckiihknclhmzvf',
      password: get(readFileSync('C:/SysMax/.env.dev.local', 'utf8'), 'SUPABASE_DEV_DB_PASSWORD'),
      database: 'postgres', ssl: { rejectUnauthorized: false } }

const cent = v => Math.round(Number(v) * 100) / 100
const dias = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const c = new pg.Client(conexao)
await c.connect()

try {
  await c.query('BEGIN')

  // Clinica pelo NOME, abortando se ambigua. Em producao ha 3 clinicas
  // "Animais" — UUID cravado aqui seria pedir para semear na errada.
  const { rows: cl } = await c.query(
    `select id, name from clinics where lower(name) = lower($1)`, [nomeClinica])
  if (cl.length !== 1)
    throw new Error(`esperava 1 clinica com o nome exato "${nomeClinica}", achei ${cl.length}`)
  const clinicId = cl[0].id
  console.log(`banco: ${alvo.toUpperCase()}  |  clinica: ${cl[0].name}`)

  // ─── remocao ───────────────────────────────────────────────────────────────
  if (remover) {
    const v = await c.query(`
      delete from bank_statement_entry_links l
       where l.clinic_id = $1
         and exists (select 1 from financial_entries e
                      where e.id = l.entry_id and e.notes like $2)`,
      [clinicId, '%' + MARCADOR + '%'])
    const t = await c.query(`
      delete from financial_entries
       where clinic_id = $1 and notes like $2
       returning left(description, 50) d, amount`, [clinicId, '%' + MARCADOR + '%'])
    const r = await c.query(`
      update bank_statements set reconciled_at = null, reconciled_entry_id = null
       where clinic_id = $1 and reconciled_entry_id is not null
         and not exists (select 1 from financial_entries e where e.id = reconciled_entry_id)`,
      [clinicId])
    console.log(`vinculos: ${v.rowCount}  titulos: ${t.rowCount}  desconciliados: ${r.rowCount}`)
    if (!confirmar) { await c.query('ROLLBACK'); console.log('\nENSAIO — nada gravado. Repita com --confirmar.'); process.exit(0) }
    await c.query('COMMIT'); console.log('\nCOMMIT — titulos de teste removidos.')
    process.exit(0)
  }

  // ─── guarda de idempotencia ────────────────────────────────────────────────
  const { rows: [ja] } = await c.query(
    `select count(*)::int n from financial_entries where clinic_id = $1 and notes like $2`,
    [clinicId, '%' + MARCADOR + '%'])
  if (ja.n > 0) throw new Error(`ja existem ${ja.n} titulos de teste nesta clinica. Rode --remover primeiro.`)

  // Conta de liquidacao: sem ela a baixa nao tem para onde apontar.
  const { rows: ba } = await c.query(
    `select id, name from bank_accounts where clinic_id = $1 order by is_default desc, name`, [clinicId])
  if (!ba.length) throw new Error('a clinica nao tem conta bancaria cadastrada — conciliacao nao e testavel aqui')
  const bancoId = ba[0].id
  console.log('conta de liquidacao:', ba[0].name)

  // Autor dos lancamentos: um admin real da clinica, para a trilha nao ficar orfa.
  const { rows: au } = await c.query(
    `select id, full_name from profiles where clinic_id = $1 and role = 'admin' order by full_name limit 1`, [clinicId])
  if (!au.length) throw new Error('a clinica nao tem admin para assinar os lancamentos')
  const autorId = au[0].id

  // ─── materia-prima: linhas do extrato ainda sem vinculo ────────────────────
  const { rows: linhas } = await c.query(`
    select s.id, s.date::text data, s.type, s.amount::float valor, s.description desc_extrato
      from bank_statements s
     where s.clinic_id = $1
       and s.description not like '[SANDBOX]%'
       and not exists (select 1 from bank_statement_entry_links l where l.statement_id = s.id)
     order by s.date desc, s.amount desc`, [clinicId])
  const creditos = linhas.filter(l => l.type === 'credit')
  const debitos  = linhas.filter(l => l.type === 'debit')
  console.log(`extrato livre: ${linhas.length} linhas (${creditos.length} credito, ${debitos.length} debito)`)
  if (creditos.length < 18 || debitos.length < 7)
    throw new Error('extrato insuficiente para montar o cenario completo')

  const titulos = []
  const push = (t, cenario, l, over = {}) => titulos.push({
    type: t, cenario,
    description: String(l.desc_extrato).slice(0, 180),
    amount: cent(Math.abs(l.valor)),
    issue_date: dias(l.data, -10),
    due_date: l.data,
    payment_date: l.data,
    ...over,
  })

  // 1) BAIXADOS que casam exatamente: o automatico tem de achar sozinho.
  //    13 a receber + 4 a pagar, como no fixture de testes.
  creditos.slice(0, 13).forEach(l => push('receivable', 'auto-vincula', l))
  debitos .slice(0, 4) .forEach(l => push('payable',    'auto-vincula', l))

  // 2) EM ABERTO: valor casa, baixa nao existe. A tela deve avisar
  //    "em aberto -> baixa" em vez de ignorar.
  creditos.slice(13, 16).forEach(l => push('receivable', 'em aberto (use BAIXAR)', l,
    { payment_date: null, due_date: dias(l.data, 10) }))
  debitos .slice(4, 6)  .forEach(l => push('payable',    'em aberto (use BAIXAR)', l,
    { payment_date: null, due_date: dias(l.data, 10) }))

  // 3) O CENARIO DA DIFERENCA: 3 linhas do extrato contra 2 titulos que somam
  //    R$ 5,62 menos. E o caso que o Diretor reportou — selecionar os 3 do
  //    extrato e os 2 do sistema e o modal da diferenca tem de abrir.
  const trio = creditos.slice(16, 19)
  const somaTrio = cent(trio.reduce((a, l) => a + Math.abs(l.valor), 0))
  const metade = cent((somaTrio - 5.62) / 2)
  const sobra  = cent(somaTrio - 5.62 - metade)   // fecha o centavo da divisao
  titulos.push({
    type: 'receivable', amount: metade, cenario: 'diferenca 5,62 (parte 1 de 2)',
    description: String(trio[0].desc_extrato).slice(0, 180),
    issue_date: dias(trio[0].data, -10), due_date: trio[0].data, payment_date: trio[0].data,
  }, {
    type: 'receivable', amount: sobra, cenario: 'diferenca 5,62 (parte 2 de 2)',
    description: String(trio[1].desc_extrato).slice(0, 180),
    issue_date: dias(trio[1].data, -10), due_date: trio[1].data, payment_date: trio[1].data,
  })
  console.log('\nAS 3 LINHAS DO EXTRATO do cenario da diferenca (selecione estas):')
  console.table(trio.map(l => ({ data: l.data, valor: Math.abs(l.valor).toFixed(2),
                                 descricao: String(l.desc_extrato).slice(0, 40) })))
  console.log(`cenario da diferenca: 3 linhas somam ${somaTrio.toFixed(2)}, 2 titulos somam ` +
              `${cent(metade + sobra).toFixed(2)} -> diferenca ${cent(somaTrio - metade - sobra).toFixed(2)}`)

  // ─── ensaio ────────────────────────────────────────────────────────────────
  console.log(`\n### ${titulos.length} titulos a criar`)
  console.table(titulos.map(t => ({
    tipo: t.type, valor: t.amount.toFixed(2),
    emissao: t.issue_date, vencimento: t.due_date, baixa: t.payment_date ?? '—',
    cenario: t.cenario, descricao: t.description.slice(0, 32),
  })))

  if (!confirmar) {
    await c.query('ROLLBACK')
    console.log('\nENSAIO — nada gravado. Repita com --confirmar.')
    process.exit(0)
  }

  // ─── gravacao ──────────────────────────────────────────────────────────────
  const criados = []
  for (const t of titulos) {
    const pago = t.payment_date !== null
    const { rows: [n] } = await c.query(`
      insert into financial_entries
        (clinic_id, type, description, amount, discount, interest,
         issue_date, due_date, payment_date, status,
         settlement_bank_id, created_by, source, notes)
      values ($1,$2,$3,$4,0,0,$5,$6,$7,$8,$9,$10,'manual',$11)
      returning id`,
      [clinicId, t.type, t.description, t.amount,
       t.issue_date, t.due_date, t.payment_date, pago ? 'paid' : 'pending',
       pago ? bancoId : null, autorId,
       MARCADOR + ' | cenario: ' + t.cenario + ' | LANCAMENTO DE TESTE da ' +
       'conciliacao bancaria, nao considerar no financeiro. Remover com: ' +
       'node scripts/seed-conciliacao-teste.mjs --clinica "' + cl[0].name +
       '" --banco ' + alvo + ' --remover --confirmar'])
    criados.push(n.id)
  }

  writeFileSync('C:/SysMax/scripts/.seed-conciliacao-ids.json',
    JSON.stringify({ banco: alvo, clinica: cl[0].name, marcador: MARCADOR,
                     quando: new Date().toISOString(), ids: criados }, null, 2))

  const { rows: [fim] } = await c.query(`
    select count(*)::int n, sum(amount)::numeric(12,2) soma
      from financial_entries where clinic_id = $1 and notes like $2`,
    [clinicId, '%' + MARCADOR + '%'])
  console.log(`\ngravados: ${fim.n} titulos, soma ${fim.soma}`)
  if (fim.n !== titulos.length) throw new Error('contagem final nao bate')

  await c.query('COMMIT')
  console.log('COMMIT — ids em scripts/.seed-conciliacao-ids.json')
} catch (e) {
  await c.query('ROLLBACK')
  console.error('\nROLLBACK, nada gravado:', e.message)
  process.exitCode = 1
} finally {
  await c.end()
}
