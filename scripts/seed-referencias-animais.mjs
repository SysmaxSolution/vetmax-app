// Carrega no DEV a tabela de referência do HEMOGRAMA da Clínica Animais,
// exatamente como a Amanda mandou (print da tela de digitação deles, 01/10/2026
// 12:29, WhatsApp comercial), com a mensagem que veio junto:
//
//   "Esses são os valores que usamos no hemograma. De MIELOCITOS até MONÓCITOS,
//    a gente confere na lâmina e depois digita. E as vezes alteramos o valor de
//    contagem plaquetária, quando as plaquetas estão abaixo ou acima do valor
//    de referência."
//
// O print é de um atendimento CANINO — por isso o conjunto nasce com
// species='dog'. A tabela felina ainda não temos; enquanto não vier, gato cai
// na regra de fallback (conjunto geral, senão faixas do aparelho).
//
// Nada aqui é fixo no código do sistema: isto é só a carga inicial. A clínica
// edita depois, e outra clínica entra com a tabela dela.
//
//   node scripts/seed-referencias-animais.mjs           # mostra o que vai gravar
//   node scripts/seed-referencias-animais.mjs --apply
//   node scripts/seed-referencias-animais.mjs --clean

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { config } from 'dotenv'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })

let CLINIC_ID = null
const PANEL = 'hemograma'
const SPECIES = 'dog'
const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const CLEAN = args.has('--clean')

if (!process.env.SUPABASE_DEV_DB_PASSWORD) {
  console.error('Falta SUPABASE_DEV_DB_PASSWORD no .env.local'); process.exit(1)
}

// label · código no aparelho · seção · origem · unidade · faixa relativa · faixa absoluta · editável · texto padrão
//
// Origem:
//   device = o URIT BH-5100 manda
//   slide  = leitura de lâmina, digitada (é o que a Amanda descreveu)
//   text   = campo livre
const ITENS = [
  // ── Eritrograma ───────────────────────────────────────────────────────────
  ['ERITRÓCITOS',                'RBC',    'erythrogram', 'device', 'milhões/mm³', '5,5 A 8,5 milhões/mm³', null, false, null],
  ['HEMOGLOBINA',                'HGB',    'erythrogram', 'device', 'g/dl',        '12,0 A 18,0 g/dl',      null, false, null],
  ['HEMATÓCRITO',                'HCT',    'erythrogram', 'device', '%',           '37 A 55 %',             null, false, null],
  ['V.C.M.',                     'MCV',    'erythrogram', 'device', 'u³',          '60 A 77 u³',            null, false, null],
  ['H.C.M.',                     'MCH',    'erythrogram', 'device', 'pg',          '19,5 A 24,5 pg',        null, false, null],
  ['C.H.C.M.',                   'MCHC',   'erythrogram', 'device', 'g/dl',        '30 A 36 g/dl',          null, false, null],
  ['RDW',                        'RDW_CV', 'erythrogram', 'device', '%',           '11 A 15 %',             null, false, null],
  // Proteína total sai do refratômetro, não do analisador hematológico.
  ['PROTEÍNA TOTAL',             null,     'erythrogram', 'slide',  'g/dl',        '5,5 A 8,0 g/dl',        null, true,  null],
  ['ERITROBLASTOS',              'NRBC',   'erythrogram', 'device', '%',           '0 %',                   null, true,  null],
  // O BH-5100 não conta reticulócitos.
  ['RETICULÓCITOS',              null,     'erythrogram', 'slide',  '%',           '0 A 12 %',              null, true,  null],
  ['OBSERVAÇÕES SÉRIE VERMELHA', null,     'erythrogram', 'text',   null,          null,                    null, true,  null],

  // ── Leucograma ────────────────────────────────────────────────────────────
  // Só o total de leucócitos vem do aparelho. Todo o diferencial é lâmina —
  // foi exatamente o que a Amanda disse ("de MIELOCITOS até MONÓCITOS").
  ['LEUCÓCITOS',                 'WBC',    'leukogram', 'device', 'mil/mm³', '6,0 A 17,0 mil/mm³', null,            false, null],
  ['MIELÓCITOS',                 null,     'leukogram', 'slide',  '%',       '0 %',                '0 A 0',         true,  null],
  ['METAMIELÓCITOS',             null,     'leukogram', 'slide',  '%',       '0 %',                '0 A 0',         true,  null],
  ['BASTONETES',                 null,     'leukogram', 'slide',  '%',       '0 A 3 %',            '0 A 160',       true,  null],
  ['SEGMENTADOS',                null,     'leukogram', 'slide',  '%',       '60 A 77 %',          '3300 A 12800',  true,  null],
  ['EOSINÓFILOS',                null,     'leukogram', 'slide',  '%',       '2 A 10 %',           '60 A 1440',     true,  null],
  ['BASÓFILOS',                  null,     'leukogram', 'slide',  '%',       '0 A 1 %',            '0 A 160',       true,  null],
  ['LINFÓCITOS TÍPICOS',         null,     'leukogram', 'slide',  '%',       '12 A 30 %',          '780 A 6400',    true,  null],
  ['LINFÓCITOS ATÍPICOS',        null,     'leukogram', 'slide',  '%',       '0 %',                '0 A 0',         true,  null],
  ['MONÓCITOS',                  null,     'leukogram', 'slide',  '%',       '3 A 10 %',           '60 A 960',      true,  null],
  ['OBSERVAÇÕES SÉRIE BRANCA',   null,     'leukogram', 'text',   null,      null,                 null,            true,  null],

  // ── Série plaquetária ─────────────────────────────────────────────────────
  // Vem do aparelho, mas editável: "às vezes alteramos o valor de contagem
  // plaquetária, quando as plaquetas estão abaixo ou acima do valor de referência".
  ['CONTAGEM PLAQUETÁRIA',       'PLT',    'platelets', 'device', 'mil/mm³', '200 a 500 mil/mm³',  null, true, null],
  ['AVALIAÇÃO PLAQUETÁRIA',      null,     'platelets', 'text',   null,      null,                 null, true, null],
  ['PESQUISA DE HEMATOZOÁRIOS',  null,     'platelets', 'text',   null,      null,                 null, true, 'Amostra negativa.'],
  ['NOTA',                       null,     'other',     'text',   null,      null,                 null, true, null],
]

/** "5,5 A 8,5 milhões/mm³" → { low: 5.5, high: 8.5 }. Só para marcar H/L. */
function faixa(txt) {
  if (!txt) return { low: null, high: null }
  const m = String(txt).match(/(-?\d+(?:[.,]\d+)?)\s*[Aa~-]\s*(-?\d+(?:[.,]\d+)?)/)
  if (m) return { low: parseFloat(m[1].replace(',', '.')), high: parseFloat(m[2].replace(',', '.')) }
  const u = String(txt).match(/^\s*(-?\d+(?:[.,]\d+)?)\s*%?\s*$/)   // "0 %" = só o zero
  return u ? { low: null, high: parseFloat(u[1].replace(',', '.')) } : { low: null, high: null }
}

const client = new pg.Client({
  host:     process.env.SUPABASE_DEV_DB_HOST ?? 'aws-0-us-east-1.pooler.supabase.com',
  port:     Number(process.env.SUPABASE_DEV_DB_PORT ?? 6543),
  user:     process.env.SUPABASE_DEV_DB_USER ?? 'postgres.claqxwckiihknclhmzvf',
  password: process.env.SUPABASE_DEV_DB_PASSWORD,
  database: process.env.SUPABASE_DEV_DB_NAME ?? 'postgres',
  ssl: { rejectUnauthorized: false },
})

// Resolve a clínica alvo PELO NOME e confere antes de gravar.
//
// Lição de 01/10/2026: estes scripts traziam um UUID fixo como padrão que era,
// na verdade, o da "Sys Demo". Rodaram sem reclamar e semearam o laudo na
// clínica errada — do lado de fora pareceu vazamento entre clínicas. UUID solto
// em script de seed não se valida sozinho; nome, sim.
async function resolverClinicaAnimais(q) {
  if (process.env.ANIMAIS_CLINIC_ID) {
    const { rows } = await q('SELECT id, name FROM clinics WHERE id = $1', [process.env.ANIMAIS_CLINIC_ID])
    if (!rows[0]) { console.error(`ANIMAIS_CLINIC_ID=${process.env.ANIMAIS_CLINIC_ID} não existe neste banco.`); process.exit(1) }
    console.log(`clínica alvo: ${rows[0].name} (${rows[0].id}) — via ANIMAIS_CLINIC_ID`)
    return rows[0].id
  }
  const { rows } = await q("SELECT id, name FROM clinics WHERE name ILIKE '%animais%' ORDER BY name")
  if (rows.length === 0) {
    console.error('Não achei nenhuma clínica com "Animais" no nome. Informe ANIMAIS_CLINIC_ID.'); process.exit(1)
  }
  if (rows.length > 1) {
    console.error('Mais de uma clínica casa com "Animais" — informe ANIMAIS_CLINIC_ID:')
    for (const r of rows) console.error(`   ${r.id}  ${r.name}`)
    process.exit(1)
  }
  console.log(`clínica alvo: ${rows[0].name} (${rows[0].id})`)
  return rows[0].id
}

async function main() {
  await client.connect()
  const q = (sql, p) => client.query(sql, p)
  CLINIC_ID = await resolverClinicaAnimais(q)

  if (CLEAN) {
    const { rowCount } = await q('DELETE FROM lab_reference_sets WHERE clinic_id=$1 AND panel_key=$2', [CLINIC_ID, PANEL])
    console.log(`removido(s) ${rowCount} conjunto(s) (os itens caem junto por cascade)`)
    await client.end(); return
  }

  if (!APPLY) {
    console.log(`\n[simulação] Conjunto "Hemograma — Canino (Animais)" · ${ITENS.length} linhas\n`)
    console.log('  ' + 'LINHA'.padEnd(28) + 'ORIGEM'.padEnd(9) + 'APARELHO'.padEnd(9) + 'REFERÊNCIA')
    for (const [label, code, , src, , ref, refAbs] of ITENS) {
      console.log('  ' + label.padEnd(28) + src.padEnd(9) + String(code ?? '—').padEnd(9) + (ref ?? '—') + (refAbs ? `   | abs ${refAbs}` : ''))
    }
    const lam = ITENS.filter(i => i[3] === 'slide').length
    const txt = ITENS.filter(i => i[3] === 'text').length
    console.log(`\n  ${ITENS.length - lam - txt} do aparelho · ${lam} de lâmina · ${txt} de texto`)
    console.log('\n  Rode de novo com --apply para gravar.')
    await client.end(); return
  }

  const { rows: s } = await q(
    `INSERT INTO lab_reference_sets (clinic_id, panel_key, species, name, is_default, notes)
     VALUES ($1,$2,$3,$4,true,$5)
     ON CONFLICT (clinic_id, panel_key, species) WHERE species IS NOT NULL
     DO UPDATE SET name = EXCLUDED.name, notes = EXCLUDED.notes, updated_at = now()
     RETURNING id`,
    [CLINIC_ID, PANEL, SPECIES, 'Hemograma — Canino (Animais)',
     'Carregado do print da tela de digitação da clínica (Amanda, 01/10/2026).'])
  const setId = s[0].id

  await q('DELETE FROM lab_reference_items WHERE set_id=$1', [setId])

  let i = 0
  for (const [label, code, section, src, unit, ref, refAbs, editavel, padrao] of ITENS) {
    const f = faixa(ref), fa = faixa(refAbs)
    await q(
      `INSERT INTO lab_reference_items
         (clinic_id, set_id, sort_order, label, analyte_code, section, input_source,
          unit, ref_text, ref_low, ref_high, ref_abs_text, ref_abs_low, ref_abs_high,
          is_visible, is_editable, default_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15,$16)`,
      [CLINIC_ID, setId, (i + 1) * 10, label, code, section, src,
       unit, ref, f.low, f.high, refAbs, fa.low, fa.high, editavel, padrao])
    i++
  }

  const { rows: conf } = await q(
    `SELECT input_source, count(*)::int n FROM lab_reference_items WHERE set_id=$1 GROUP BY 1 ORDER BY 1`, [setId])
  console.log(`\n✓ conjunto gravado com ${i} linhas (clínica ${CLINIC_ID}, ${PANEL}, espécie ${SPECIES})`)
  for (const c of conf) console.log(`   ${String(c.n).padStart(3)} ${c.input_source}`)
  console.log('\n   Falta a tabela FELINA — enquanto não vier, gato cai no fallback.')
  await client.end()
}

main().catch(async e => { console.error(e); try { await client.end() } catch {} ; process.exit(1) })
