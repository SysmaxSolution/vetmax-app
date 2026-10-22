// Conserta os títulos que o DDA lançou SEM fornecedor.
//
// O defeito: `suppliers.category` tem CHECK com lista fechada e o código
// gravava 'Fornecedores'. O insert era recusado, o erro era engolido, e os
// títulos nasceram sem vínculo. O código já está corrigido — isto é a
// correção dos dados que ficaram para trás.
//
// Casa o título com o boleto guardado em `dda_boletos` por `entry_id` quando
// houver carimbo, senão por beneficiário + valor. Cria o fornecedor pelo CNPJ
// (nunca pelo nome) e amarra.
//
// Uso:
//   node scripts/corrigir-fornecedores-dda-producao.mjs            # ensaio
//   node scripts/corrigir-fornecedores-dda-producao.mjs --confirmar
import pg from 'pg'
import https from 'node:https'
import { readFileSync } from 'node:fs'

const confirmar = process.argv.includes('--confirmar')
const env = readFileSync('C:/SysMax/.env.local', 'utf8')
const get = k => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')

const soDig = v => String(v ?? '').replace(/\D/g, '')
const fmtCnpj = d => soDig(d).length === 14
  ? soDig(d).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  : soDig(d)

/** Consulta pública, com as duas fontes — igual ao lookupCnpj do app. */
const buscarCnpj = doc => new Promise(res => {
  const tenta = (host, caminho, proximo) => {
    const r = https.request({ hostname: host, path: caminho, method: 'GET',
      headers: { Accept: 'application/json' }, timeout: 8000 }, s => {
      let d = ''; s.on('data', x => d += x)
      s.on('end', () => {
        try { const j = JSON.parse(d); if (s.statusCode === 200 && j.razao_social)
          return res({ nome: j.razao_social, fonte: host }) } catch {}
        proximo ? proximo() : res({ nome: null })
      })
    })
    r.on('error', () => proximo ? proximo() : res({ nome: null }))
    r.on('timeout', () => { r.destroy(); proximo ? proximo() : res({ nome: null }) })
    r.end()
  }
  tenta('publica.cnpj.ws', `/cnpj/${doc}`, () =>
    tenta('brasilapi.com.br', `/api/cnpj/v1/${doc}`, null))
})

const c = new pg.Client({ connectionString: get('DATABASE_URL'), ssl: { rejectUnauthorized: false } })
await c.connect()

try {
  await c.query('BEGIN')

  // Títulos do DDA sem fornecedor: têm código de barras e vieram da categoria
  // lançada pela rotina.
  const { rows: titulos } = await c.query(`
    select e.id, e.clinic_id, e.description, e.amount, e.beneficiary, e.barcode
      from financial_entries e
     where e.type = 'payable' and e.supplier_id is null
       and e.barcode is not null and e.category = 'Fornecedores'
     order by e.created_at`)

  if (!titulos.length) { console.log('nenhum título do DDA sem fornecedor.'); await c.query('ROLLBACK'); process.exit(0) }
  console.log(`títulos do DDA sem fornecedor: ${titulos.length}\n`)

  const porCnpj = new Map()
  let criados = 0, vinculados = 0

  for (const t of titulos) {
    // Acha o boleto guardado: por carimbo, senão por código de barras.
    const { rows: bo } = await c.query(`
      select beneficiary, beneficiary_doc from dda_boletos
       where clinic_id = $1 and (entry_id = $2 or regexp_replace(coalesce(barcode,''),'\\D','','g') = $3)
       limit 1`, [t.clinic_id, t.id, soDig(t.barcode)])

    const doc = soDig(bo[0]?.beneficiary_doc)
    const nomeBanco = bo[0]?.beneficiary ?? t.beneficiary ?? t.description

    if (doc.length !== 14 && doc.length !== 11) {
      console.log(`· ${String(t.description).slice(0, 38).padEnd(38)} SEM CNPJ no DDA — fica manual`)
      continue
    }

    let supplierId = porCnpj.get(doc)
    if (!supplierId) {
      // Já existe pelo documento?
      const { rows: ex } = await c.query(`
        select id, name from suppliers
         where clinic_id = $1 and regexp_replace(coalesce(document,''),'\\D','','g') = $2 limit 1`,
        [t.clinic_id, doc])

      if (ex.length) {
        supplierId = ex[0].id
        console.log(`· ${String(nomeBanco).slice(0, 38).padEnd(38)} já cadastrado`)
      } else {
        const r = await buscarCnpj(doc)
        const nome = r.nome ?? nomeBanco
        const { rows: novo } = await c.query(`
          insert into suppliers (clinic_id, name, document, is_active, notes)
          values ($1, $2, $3, true, $4) returning id`,
          [t.clinic_id, nome, fmtCnpj(doc), 'Cadastrado a partir do DDA do banco.'])
        supplierId = novo[0].id
        criados++
        console.log(`+ ${String(nome).slice(0, 48).padEnd(48)} ${fmtCnpj(doc)}${r.nome ? ' [Receita]' : ' [nome do banco]'}`)
        await new Promise(s => setTimeout(s, 1500))   // respeita o limite de taxa
      }
      porCnpj.set(doc, supplierId)
    }

    await c.query(`update financial_entries set supplier_id = $1 where id = $2 and clinic_id = $3`,
      [supplierId, t.id, t.clinic_id])
    vinculados++
  }

  // Conferência dentro da transação
  const { rows: fim } = await c.query(`
    select count(*)::int sem_fornecedor from financial_entries
     where type='payable' and supplier_id is null and barcode is not null and category='Fornecedores'`)

  console.log(`\nfornecedores criados: ${criados} · títulos vinculados: ${vinculados}`)
  console.log(`títulos do DDA ainda sem fornecedor: ${fim[0].sem_fornecedor}`)

  if (!confirmar) { await c.query('ROLLBACK'); console.log('\nENSAIO — nada gravado. Repita com --confirmar.') }
  else            { await c.query('COMMIT');   console.log('\nCOMMIT.') }
} catch (e) {
  await c.query('ROLLBACK')
  console.error('\nROLLBACK, nada gravado:', e.message)
  process.exitCode = 1
} finally { await c.end() }
