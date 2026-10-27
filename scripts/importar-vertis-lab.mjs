// Carrega no SYSVETMAX o laboratório da Clínica Animais a partir do pacote
// extraído do backup do Vertis (C:\SysMax\_backups\Animais\testes\*.csv).
//
// O que entra (escopo autorizado em 22/10: só layouts e referências):
//   • Tabela de referência do HEMOGRAMA por espécie (cão, gato, ave, coelho),
//     na ORDEM DE IMPRESSÃO do Vertis, com a faixa da raça "SRD <espécie>"
//     na banda ADULTA — é a faixa genérica da clínica, sem conflito de raça.
//   • Tabela de referência de BIOQUÍMICA por espécie (cão; gato onde houver),
//     uma linha por exame bioquímico, ligada ao código que o Sérium 200 envia.
//   • As 300 máscaras de laudo (lab_result_presets) e o vínculo delas com as
//     linhas de texto do hemograma (observações, hematozoários).
//   • Catálogo de analitos + de-para dos códigos reais dos aparelhos.
//
// O que NÃO entra: faixas por raça (65% conflitam entre si — decisão de MV),
// exames fora de hemograma/bioquímica (o laudo do sistema hoje monta só esses
// dois painéis), tutores, pets, histórico.
//
//   node scripts/importar-vertis-lab.mjs                      # ensaio: mostra o que faria
//   node scripts/importar-vertis-lab.mjs --apply              # grava
//   node scripts/importar-vertis-lab.mjs --clinic "Nome"      # outra clínica
//
// Só grava no banco de TESTES (claqxwckiihknclhmzvf) a menos que --prod venha
// explícito — produção é decisão do Diretor, não do script.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import pg from 'pg'
import { config } from 'dotenv'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })

const args = process.argv.slice(2)
const flag = n => args.includes(n)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const APPLY = flag('--apply')
const DIR = opt('--dir', 'C:/SysMax/_backups/Animais/testes')
const CLINIC_NAME = opt('--clinic', 'Animais Clínica Veterinária')

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL ausente no .env.local'); process.exit(1) }
if (!url.includes('claqxwckiihknclhmzvf') && !flag('--prod')) {
  console.error('Este banco não é o de testes. Para produção, passe --prod de propósito.'); process.exit(1)
}

// ─── Leitura dos CSVs (Windows-1252) ─────────────────────────────────────────
const dec = new TextDecoder('windows-1252')
const csv = name => parse(dec.decode(readFileSync(resolve(DIR, name))), { columns: true, skip_empty_lines: true, relax_column_count: true })
const linhas    = csv('layout_linhas.csv')
const mascaras  = csv('layout_mascaras.csv')
const refs      = csv('referencias.csv').filter(r => r.qualidade === 'APROVEITAVEL')
const racas     = Object.fromEntries(csv('apoio_racas.csv').map(r => [r.cod_raca, r]))

// ─── Dicionários ─────────────────────────────────────────────────────────────
const SRD = { '2': 'dog', '3': 'cat', '437': 'bird', '908': 'rabbit', '926': 'rodent' }
const ESPECIE_VERTIS = { CANINA: 'dog', FELINA: 'cat', AVE: 'bird', PSITACIDEO: 'bird', ANATIDEO: 'bird', COELHO: 'rabbit', ROEDOR: 'rodent', RATO: 'rodent' }
const ESPECIE_LABEL = { dog: 'Canina', cat: 'Felina', bird: 'Aves', rabbit: 'Lagomorfa', rodent: 'Roedores' }

const semAcento = s => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

// Hemograma: o que o URIT BH-5100 manda (códigos vistos em exam_results no dev)
// e o que é leitura de lâmina (a Amanda confirmou: de mielócitos a monócitos).
const HEMO_DEVICE = {
  'ERITROCITOS': 'RBC', 'HEMOGLOBINA': 'HGB', 'HEMATOCRITO': 'HCT', 'V.C.M.': 'MCV', 'H.C.M.': 'MCH',
  'C.H.C.M.': 'MCHC', 'RDW': 'RDW_CV', 'ERITROBLASTOS': 'NRBC', 'LEUCOCITOS': 'WBC', 'CONTAGEM PLAQUETARIA': 'PLT',
}
const HEMO_SLIDE = new Set(['MIELOCITOS', 'METAMIELOCITOS', 'BASTONETES', 'SEGMENTADOS', 'EOSINOFILOS', 'BASOFILOS',
  'LINFOCITOS TIPICOS', 'LINFOCITOS ATIPICOS', 'MONOCITOS', 'RETICULOCITOS', 'PROTEINA TOTAL'])

// Bioquímica: exame do Vertis → código que o Sérium 200 envia (catálogo do
// aparelho, print de 06/10) ou leitura manual quando o aparelho não dosa.
const BIO = [
  ['CREATININA', 'CREAT'], ['ALT (T.G.P.)', 'TGP-EB'], ['AST (T.G.O.)', 'TGO-EB'], ['UREIA', 'UREIA-EB'],
  ['FOSFATASE ALCALINA', 'FAL IFCC'], ['ALBUMINA', 'ALBUMINA'], ['GLICEMIA/GLICOSE', 'GLICOSE'],
  ['PROTEINA TOTAL', 'PROT T'], ['GAMA-GLUTAMIL TRANSFERASE (GGT)', 'GGT'], ['TRIGLICERIDES', 'TRI'],
  ['COLESTEROL TOTAL', 'COLESTEROL'], ['FOSFORO (P)', 'FOSF'], ['CALCIO TOTAL', 'CALCIO'],
  ['BILIRRUBINAS TOTAL E FRACOES (D + I)', null], ['AMILASE', 'AMILASE'], ['LIPASE', 'LIPASE'],
  ['LACTATO', 'LACTATO'], ['ACIDO URICO', 'ACIDO URIC'], ['FERRO', 'FERRO'], ['FRUTOSAMINA', 'FRUT'],
  ['MAGNESIO', 'MAG'], ['CK (CREATINOFOSFOQUINASE)', 'CK'], ['CK-MB', 'CK-MB'], ['LDH', 'LDH'],
  ['PCR (PROTEINA C REATIVA)', 'PCR-BIO'], ['POTASSIO', null], ['SODIO (Na)', null], ['CLORO', null],
  ['CALCIO IONIZAVEL / LIVRE', null],
]

// ─── Referências: faixa ADULTA da raça SRD da espécie ─────────────────────────
const ADULTO = /ACIMA DE 1 ANO|ACIMA DE 6 MESES|0 A 9\d|0 A 40|0 A 90|^O A 99/i
function refPara(exameNorm, analitoNorm, especie) {
  const cands = refs.filter(r => semAcento(r.exame) === exameNorm && semAcento(r.analito) === analitoNorm)
  const srd = cands.filter(r => SRD[r.cod_raca_origem] === especie)
  let escolha = srd.find(r => ADULTO.test(r.idade_texto)) ?? srd.sort((a, b) => Number(b.idade_max_dias) - Number(a.idade_max_dias))[0]
  let origem = escolha ? 'SRD' : null
  if (!escolha) {
    // Sem SRD: mediana entre as raças da espécie (marcado para a Amanda revisar).
    const unidades = {}; for (const r of cands) { const u = semAcento(r.unidade); if (u) unidades[u] = (unidades[u] ?? 0) + 1 }
    const unidadePadrao = Object.entries(unidades).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    const daEspecie = cands.filter(r => ESPECIE_VERTIS[(racas[r.cod_raca_origem]?.especie ?? '').toUpperCase()] === especie && Number(r.ref_max) > 0 && (!unidadePadrao || semAcento(r.unidade) === unidadePadrao))
    if (!daEspecie.length) return null
    const med = xs => { const s = xs.map(Number).sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
    const base = daEspecie[0]
    escolha = { ...base, ref_min: String(med(daEspecie.map(r => r.ref_min))), ref_max: String(med(daEspecie.map(r => r.ref_max))), ref_texto: '' }
    origem = `mediana de ${daEspecie.length} raças`
  }
  return { ...escolha, origem }
}
const fmt = n => { const v = Number(n); if (!Number.isFinite(v)) return ''; return (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)))).replace('.', ',') }
const faixaTexto = (r, unidade) => (r.ref_texto?.trim()) || `${fmt(r.ref_min)} A ${fmt(r.ref_max)} ${unidade ?? ''}`.trim()
const absTexto = r => (r.ref_abs_texto?.trim()) || (Number(r.ref_abs_max) > 0 ? `${fmt(r.ref_abs_min)} A ${fmt(r.ref_abs_max)}` : null)
const idadeDias = r => ({ min: r.idade_min_dias !== '' ? Number(r.idade_min_dias) : null, max: r.idade_max_dias !== '' ? Number(r.idade_max_dias) : null, texto: r.idade_texto?.trim() || null })

// ─── Montagem dos conjuntos ───────────────────────────────────────────────────
const mascaraPor = Object.fromEntries(mascaras.map(m => [m.codigo, m]))
const HEMO_VARIANTE = { dog: ['HEMOGRAMA', 'HEMOGRAMA COLETADO'], cat: ['HEMOGRAMA', 'HEMOGRAMA COLETADO'], bird: ['HEMOGRAMA AVES', 'HEMOGRAMA PSITACIDEO', 'HEMOGRAMA'], rabbit: ['HEMOGRAMA COELHO', 'HEMOGRAMA'] }

function montarHemograma(especie) {
  const layout = linhas.filter(l => l.cod_exame === '21').sort((a, b) => Number(a.ordem) - Number(b.ordem))
  let secao = 'other'
  const itens = []
  let achadas = 0, faltando = []
  for (const l of layout) {
    const rotuloN = semAcento(l.analito)
    if (l.tipo_linha === 'cabecalho') {
      secao = rotuloN === 'ERITROGRAMA' ? 'erythrogram' : rotuloN === 'LEUCOGRAMA' ? 'leukogram' : 'other'
      continue
    }
    if (rotuloN.includes('PLAQUET') || rotuloN.includes('HEMATOZO')) secao = 'platelets'
    if (rotuloN === 'NOTA') secao = 'other'
    const code = HEMO_DEVICE[rotuloN] ?? null
    const fonte = l.tipo_linha === 'texto' ? 'text' : code ? 'device' : HEMO_SLIDE.has(rotuloN) ? 'slide' : 'slide'
    let ref = null
    if (fonte !== 'text') {
      for (const ex of HEMO_VARIANTE[especie]) { ref = refPara(semAcento(ex), rotuloN, especie); if (ref) break }
      if (ref) achadas++; else faltando.push(l.rotulo_no_laudo)
    }
    const masc = l.mascara_cod ? mascaraPor[l.mascara_cod] : null
    const idade = ref ? idadeDias(ref) : { min: null, max: null, texto: null }
    itens.push({
      label: l.rotulo_no_laudo.trim(), analyte_code: code, section: secao, input_source: fonte,
      unit: ref?.unidade?.trim() || null,
      ref_text: ref ? faixaTexto(ref, ref.unidade?.trim()) : null, ref_low: ref ? Number(ref.ref_min) : null, ref_high: ref ? Number(ref.ref_max) : null,
      ref_abs_text: ref ? absTexto(ref) : null, ref_abs_low: ref && Number(ref.ref_abs_max) > 0 ? Number(ref.ref_abs_min) : null, ref_abs_high: ref && Number(ref.ref_abs_max) > 0 ? Number(ref.ref_abs_max) : null,
      ref_abs_unit: ref?.unidade_abs?.trim() || null,
      age_min_days: idade.min, age_max_days: idade.max, age_text: idade.texto,
      is_visible: l.exibe_no_laudo !== 'N', is_editable: fonte !== 'device' || code === 'PLT',
      default_text: fonte === 'text' && masc?.texto_limpo?.trim() && masc.texto_limpo.trim().length <= 120 ? masc.texto_limpo.trim() : null,
      preset_code: masc?.codigo ?? null, origem: ref?.origem ?? null,
    })
  }
  return { itens, achadas, faltando }
}

function montarBioquimico(especie) {
  const itens = []; let achadas = 0; const faltando = []
  for (const [exame, code] of BIO) {
    const exN = semAcento(exame)
    const layout = linhas.filter(l => semAcento(l.exame) === exN)
    if (!layout.length) continue
    // Bilirrubinas: total + direta no mesmo laudo, dois códigos do aparelho.
    const subitens = exN.startsWith('BILIRRUBINAS')
      ? layout.filter(l => l.tipo_linha === 'valor' && /TOTAL|DIRETA/.test(semAcento(l.analito))).map(l => ({ l, code: /TOTAL/.test(semAcento(l.analito)) ? 'BILI-T' : /INDIRETA/.test(semAcento(l.analito)) ? null : 'BILI-D' }))
      : [{ l: layout.find(l => l.tipo_linha === 'valor' && semAcento(l.analito) === 'RESULTADO') ?? layout.find(l => l.tipo_linha === 'valor'), code }]
    for (const { l, code: c } of subitens) {
      if (!l) continue
      let ref = refPara(exN, semAcento(l.analito), especie)
      // Mediana entre raças só vale se a unidade bater com a da faixa canina SRD
      // (albumina felina em "mg/dl" no Vertis é erro de cadastro, não biologia).
      if (ref && ref.origem !== 'SRD' && especie !== 'dog') {
        const cao = refPara(exN, semAcento(l.analito), 'dog')
        if (cao && semAcento(cao.unidade).replace(/[^A-Z0-9]/g, '') !== semAcento(ref.unidade).replace(/[^A-Z0-9]/g, '')) { faltando.push(exame + ' (unidade incoerente: ' + ref.unidade + ')'); ref = null }
      }
      if (ref) achadas++; else if (!faltando.includes(exame)) faltando.push(exame)
      if (!ref && especie !== 'dog') continue   // sem faixa não vale a pena cadastrar fora do cão
      const idade = ref ? idadeDias(ref) : { min: null, max: null, texto: null }
      const label = subitens.length > 1 ? `BILIRRUBINA ${/TOTAL/.test(semAcento(l.analito)) ? 'TOTAL' : /INDIRETA/.test(semAcento(l.analito)) ? 'INDIRETA' : 'DIRETA'}` : exame.replace(/\s+\(.*$/, '').replace('GLICEMIA/GLICOSE', 'GLICOSE')
      itens.push({
        label, analyte_code: c, section: 'biochem', input_source: c ? 'device' : 'slide',
        unit: ref?.unidade?.trim() || null,
        ref_text: ref ? faixaTexto(ref, ref.unidade?.trim()) : null, ref_low: ref ? Number(ref.ref_min) : null, ref_high: ref ? Number(ref.ref_max) : null,
        ref_abs_text: null, ref_abs_low: null, ref_abs_high: null, ref_abs_unit: null,
        age_min_days: idade.min, age_max_days: idade.max, age_text: idade.texto,
        is_visible: true, is_editable: !c, default_text: null, preset_code: null, origem: ref?.origem ?? null,
      })
    }
  }
  itens.push({ label: 'INTERPRETAÇÃO / OBSERVAÇÕES', analyte_code: null, section: 'biochem', input_source: 'text', unit: null, ref_text: null, ref_low: null, ref_high: null, ref_abs_text: null, ref_abs_low: null, ref_abs_high: null, ref_abs_unit: null, age_min_days: null, age_max_days: null, age_text: null, is_visible: true, is_editable: true, default_text: null, preset_code: null, origem: null })
  return { itens, achadas, faltando }
}

const CONJUNTOS = []
for (const sp of ['dog', 'cat', 'bird', 'rabbit']) {
  const h = montarHemograma(sp)
  if (h.achadas >= 8) CONJUNTOS.push({ panel_key: 'hemograma', species: sp, name: `Hemograma — ${ESPECIE_LABEL[sp]} (Vertis)`, ...h })
  else console.log(`  (hemograma ${sp}: só ${h.achadas} faixas SRD — não cadastrado)`)
}
for (const sp of ['dog', 'cat']) {
  const b = montarBioquimico(sp)
  if (b.achadas >= 4) CONJUNTOS.push({ panel_key: 'bioquimico', species: sp, name: `Bioquímica — ${ESPECIE_LABEL[sp]} (Vertis)`, ...b })
  else console.log(`  (bioquímico ${sp}: só ${b.achadas} faixas — não cadastrado)`)
}

// ─── Relatório do ensaio ──────────────────────────────────────────────────────
console.log(`\nClínica: ${CLINIC_NAME} · ${APPLY ? 'GRAVANDO' : 'ENSAIO (nada gravado — use --apply)'}\n`)
for (const c of CONJUNTOS) {
  console.log(`== ${c.name}: ${c.itens.length} linhas · ${c.achadas} com faixa${c.faltando.length ? ` · sem faixa: ${c.faltando.join(', ')}` : ''}`)
  for (const i of c.itens) {
    const org = i.origem && i.origem !== 'SRD' ? ` [${i.origem}]` : ''
    console.log(`   ${i.section.padEnd(11)} ${i.input_source.padEnd(6)} ${(i.analyte_code ?? '').padEnd(9)} ${i.label.padEnd(30)} ${(i.ref_text ?? '').padEnd(28)} ${i.ref_abs_text ?? ''}${i.age_text ? ' · ' + i.age_text : ''}${org}${i.default_text ? ' · "' + i.default_text.slice(0, 30) + '"' : ''}`)
  }
}
console.log(`\n== Máscaras: ${mascaras.length} (ativas ${mascaras.filter(m => m.situacao === 'A').length})`)

// ─── Gravação ─────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const { rows: cl } = await client.query('select id from clinics where name = $1', [CLINIC_NAME])
  if (!cl.length) throw new Error(`Clínica "${CLINIC_NAME}" não existe neste banco.`)
  const clinicId = cl[0].id

  // Compara com o que já existe (ex.: o hemograma canino digitado da Amanda).
  const { rows: existentes } = await client.query(
    `select s.id, s.panel_key, s.species, s.name, s.notes, count(i.id)::int itens from lab_reference_sets s left join lab_reference_items i on i.set_id = s.id where s.clinic_id = $1 group by s.id`, [clinicId])
  // Conjunto que a clínica já digitou (o hemograma canino da Amanda, 01/10)
  // é a prática atual e VALE MAIS que a raça "SRD" do Vertis — cujos valores
  // caninos, medidos, não batem com o que a clínica imprime hoje. Nesses casos
  // as linhas existentes ficam; do Vertis entram só as linhas que faltam
  // (textos com máscara) e a máscara das linhas de texto.
  for (const c of CONJUNTOS) {
    const ex = existentes.find(e => e.panel_key === c.panel_key && e.species === c.species)
    if (!ex || !ex.itens || (ex.notes ?? '').startsWith('Carregado do backup do Vertis')) continue   // o que este script criou, ele substitui
    const { rows: velhas } = await client.query('select label, ref_text from lab_reference_items where clinic_id = $1 and set_id = $2', [clinicId, ex.id])
    const difs = [], novas = []
    for (const v of velhas) {
      const n = c.itens.find(i => semAcento(i.label) === semAcento(v.label))
      if (n && semAcento(n.ref_text ?? '') !== semAcento(v.ref_text ?? '')) difs.push(`${v.label}: clínica "${v.ref_text ?? ''}" · Vertis "${n.ref_text ?? ''}"`)
    }
    for (const n of c.itens) if (!velhas.find(v => semAcento(v.label) === semAcento(n.label))) novas.push(n.label)
    c.manter = true
    console.log(`\n== "${ex.name}" (${ex.itens} linhas) já existe para ${c.panel_key}/${c.species}: MANTIDO. Linhas que o Vertis acrescenta: ${novas.join(', ') || 'nenhuma'}. Faixas em que o Vertis diverge da clínica (só para conferência, ${difs.length}):`)
    difs.forEach(d => console.log('   ', d))
  }

  if (!APPLY) { console.log('\nENSAIO encerrado.'); process.exit(0) }

  await client.query('BEGIN')

  // 1) Máscaras
  let presetsNovos = 0
  const presetId = {}
  for (const m of mascaras) {
    const code = (m.codigo ?? '').trim(); if (!code) continue
    const body = (m.texto_limpo?.trim() || m.resumo?.trim() || code)
    const { rows } = await client.query(
      `insert into lab_result_presets (clinic_id, code, label, body, body_plain, sector, is_active)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (clinic_id, code) do update set label = excluded.label, body = excluded.body, body_plain = excluded.body_plain, sector = excluded.sector, is_active = excluded.is_active, updated_at = now()
       returning id`,
      [clinicId, code, m.resumo?.trim() || null, body, m.texto_limpo?.trim() || null, m.setor?.trim() || null, m.situacao === 'A'])
    presetId[code] = rows[0].id; presetsNovos++
  }

  // 2) Conjuntos e linhas
  for (const c of CONJUNTOS) {
    const ex = existentes.find(e => e.panel_key === c.panel_key && e.species === c.species)
    let setId = ex?.id
    if (setId && c.manter) {
      // Mantém as linhas da clínica; acrescenta só o que falta, no fim.
      const { rows: velhas } = await client.query('select label, input_source, preset_id, max(sort_order) over () ultimo from lab_reference_items where clinic_id = $1 and set_id = $2', [clinicId, setId])
      let ordem = Number(velhas[0]?.ultimo ?? 0)
      for (const i of c.itens) {
        const v = velhas.find(x => semAcento(x.label) === semAcento(i.label))
        if (v) {
          if (i.preset_code && presetId[i.preset_code] && !v.preset_id) await client.query('update lab_reference_items set preset_id = $3 where clinic_id = $1 and set_id = $2 and label = $4', [clinicId, setId, presetId[i.preset_code], v.label])
          continue
        }
        ordem += 10
        await client.query(
          `insert into lab_reference_items (clinic_id, set_id, sort_order, label, analyte_code, section, input_source, unit, ref_text, ref_low, ref_high, ref_abs_text, ref_abs_low, ref_abs_high, ref_abs_unit, age_min_days, age_max_days, age_text, is_visible, is_editable, default_text, preset_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [clinicId, setId, ordem, i.label, i.analyte_code, i.section, i.input_source, i.unit, i.ref_text, i.ref_low, i.ref_high, i.ref_abs_text, i.ref_abs_low, i.ref_abs_high, i.ref_abs_unit,
           i.age_min_days, i.age_max_days, i.age_text, i.is_visible, i.is_editable, i.default_text, i.preset_code ? presetId[i.preset_code] ?? null : null])
      }
      continue
    }
    if (setId) {
      await client.query('update lab_reference_sets set name = $2, is_active = true, notes = $3, updated_at = now() where id = $1', [setId, c.name, 'Carregado do backup do Vertis (raça SRD, faixa adulta) em ' + new Date().toISOString().slice(0, 10)])
      await client.query('delete from lab_reference_items where clinic_id = $1 and set_id = $2', [clinicId, setId])
    } else {
      const { rows } = await client.query(
        'insert into lab_reference_sets (clinic_id, panel_key, species, name, is_default, is_active, notes) values ($1,$2,$3,$4,false,true,$5) returning id',
        [clinicId, c.panel_key, c.species, c.name, 'Carregado do backup do Vertis (raça SRD, faixa adulta) em ' + new Date().toISOString().slice(0, 10)])
      setId = rows[0].id
    }
    let ordem = 0
    for (const i of c.itens) {
      ordem += 10
      await client.query(
        `insert into lab_reference_items (clinic_id, set_id, sort_order, label, analyte_code, section, input_source, unit, ref_text, ref_low, ref_high, ref_abs_text, ref_abs_low, ref_abs_high, ref_abs_unit, age_min_days, age_max_days, age_text, is_visible, is_editable, default_text, preset_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [clinicId, setId, ordem, i.label, i.analyte_code, i.section, i.input_source, i.unit, i.ref_text, i.ref_low, i.ref_high, i.ref_abs_text, i.ref_abs_low, i.ref_abs_high, i.ref_abs_unit,
         i.age_min_days, i.age_max_days, i.age_text, i.is_visible, i.is_editable, i.default_text, i.preset_code ? presetId[i.preset_code] ?? null : null])
    }
  }

  // 3) Catálogo de analitos + de-para dos aparelhos
  let analitos = 0, mapas = 0
  const todos = CONJUNTOS.flatMap(c => c.itens.filter(i => i.analyte_code).map(i => ({ ...i, panel: c.panel_key })))
  const vistos = new Set()
  for (const i of todos) {
    if (vistos.has(i.analyte_code)) continue; vistos.add(i.analyte_code)
    const { rows } = await client.query(
      `insert into exam_analytes (clinic_id, code, name, unit, panel, sort_order, is_active) values ($1,$2,$3,$4,$5,$6,true)
       on conflict (clinic_id, code) do update set name = excluded.name, unit = coalesce(excluded.unit, exam_analytes.unit), panel = excluded.panel returning id`,
      [clinicId, i.analyte_code, i.label, i.unit, i.panel, analitos * 10])
    analitos++
    const { rows: m } = await client.query('select id from lab_analyte_mappings where clinic_id = $1 and device_code = $2', [clinicId, i.analyte_code])
    if (!m.length) {
      await client.query('insert into lab_analyte_mappings (clinic_id, device_code, device_name, analyte_id) values ($1,$2,$3,$4)', [clinicId, i.analyte_code, i.analyte_code, rows[0].id])
      mapas++
    }
  }

  await client.query('COMMIT')
  console.log(`\nGRAVADO: ${CONJUNTOS.length} conjuntos (${CONJUNTOS.reduce((s, c) => s + c.itens.length, 0)} linhas) · ${presetsNovos} máscaras · ${analitos} analitos · ${mapas} de-para novos.`)
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('\nERRO — nada gravado:', e.message)
  process.exitCode = 1
} finally { await client.end() }
