// Semeia no banco DEV a massa REAL capturada do URIT BH-5100 da Clínica Animais.
//
// Fonte dos dados: C:\SysvetmaxLabAgent\pending-results.jsonl (5 linhas
// {hl7, barcode}; as 5 carregam o MESMO resultado clínico — amostra 226404 —
// retransmitido, com dois carimbos de hora no MSH). Semeamos UM atendimento
// com esse resultado, que é o que o aparelho de fato produziu.
//
// NADA é inventado: valores, unidades, faixas de referência, flags H/L e as 7
// curvas (histogramas/scattergramas em PNG base64) vêm do próprio HL7.
//
// Uso:
//   node scripts/seed-hemograma-animais.mjs            # semeia como RASCUNHO
//   node scripts/seed-hemograma-animais.mjs --release  # já libera (assinado)
//   node scripts/seed-hemograma-animais.mjs --clean    # remove o que foi semeado
//
// Credenciais: .env.local do worktree (SUPABASE_DEV_DB_PASSWORD). Nunca hardcode.

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { config } from 'dotenv'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })

let CLINIC_ID = null
const JSONL = process.env.LAB_JSONL ?? 'C:/SysvetmaxLabAgent/pending-results.jsonl'
const TAG = '[LAUDO-DEMO]'

const args = new Set(process.argv.slice(2))
const DO_CLEAN = args.has('--clean')
const DO_RELEASE = args.has('--release')

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

// ---------------------------------------------------------------- HL7 parsing
// Cópia mínima e independente do parser de src/lib/lab/hl7-parser.ts — o script
// roda fora do bundle do Next (sem alias @/), então não importa o módulo TS.

function parseRange(ref) {
  const m = String(ref ?? '').match(/^\s*(-?\d+(?:[.,]\d+)?)\s*-\s*(-?\d+(?:[.,]\d+)?)\s*$/)
  return m ? { low: parseFloat(m[1].replace(',', '.')), high: parseFloat(m[2].replace(',', '.')) } : { low: null, high: null }
}

function parseORU(message) {
  const segs = message.split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean)
  const out = { panel: null, sample_id: null, device: null, observed_at: null, analytes: [], graphs: [] }
  for (const seg of segs) {
    const f = seg.split('|')
    if (f[0] === 'MSH') out.device = out.device || (f[2] || '').trim() || (f[3] || '').trim() || null
    else if (f[0] === 'OBR') {
      const svc = (f[4] ?? '').split('^')
      out.panel = (svc[1] || svc[0] || null) || out.panel
      out.sample_id = out.sample_id || ((f[3] ?? '').split('^')[0] || '').trim() || null
      out.device = ((svc[1] || svc[0] || '').trim() || null) ?? out.device
      const m = String(f[7] ?? '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/)
      if (m && !out.observed_at) out.observed_at = `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}`
    } else if (f[0] === 'OBX') {
      const type = (f[2] ?? '').trim().toUpperCase()
      const obsId = (f[3] ?? '').split('^')
      const code = obsId[0] || null
      if (type === 'ED') {
        const parts = (f[5] ?? '').split('^')
        if (parts.length >= 5) {
          const data = parts.slice(4).join('^').trim()
          if (data) out.graphs.push({ code, mime: `${parts[1]}/${parts[2]}`.toLowerCase(), encoding: parts[3] || 'Base64', data })
        }
        continue
      }
      const value = (f[5] ?? '').trim()
      if (!value) continue
      const ref = (f[7] ?? '').trim() || null
      const { low, high } = parseRange(ref)
      const rawFlag = (f[8] ?? '').trim().toUpperCase()
      const flag = ['H', 'L', 'N', 'A'].includes(rawFlag) ? rawFlag
        : (low !== null && high !== null && Number.isFinite(parseFloat(value))
            ? (parseFloat(value) < low ? 'L' : parseFloat(value) > high ? 'H' : 'N') : null)
      out.analytes.push({ code, name: obsId[1] || obsId[0] || 'Analito', value, unit: (f[6] ?? '').trim() || null, ref_text: ref, ref_low: low, ref_high: high, flag })
    }
  }
  return out
}

/** Mesma regra do app: guarda o HL7 sem os payloads base64 (cabe em raw_hl7). */
function stripED(message) {
  return String(message ?? '').split(/(\r\n|\r|\n)/).map(part => {
    if (!part.startsWith('OBX')) return part
    const f = part.split('|')
    if ((f[2] ?? '').trim().toUpperCase() !== 'ED') return part
    const parts = (f[5] ?? '').split('^')
    if (parts.length < 2) return part
    const payload = parts[parts.length - 1] ?? ''
    parts[parts.length - 1] = `<${payload.length} bytes base64 omitidos>`
    f[5] = parts.join('^')
    return f.join('|')
  }).join('')
}

const GRAPH_TITLES = {
  WBCHISTO: 'Histograma de leucócitos (WBC)',
  RBCHISTO: 'Histograma de hemácias (RBC)',
  PLTHISTO: 'Histograma de plaquetas (PLT)',
  S0HISTO: 'Histograma S0 (dispersão frontal)',
  S0S10DIFFSCATTERGRAM: 'Scattergrama diferencial S0 × S10',
  S90S90DDIFFSCATTERGRAM: 'Scattergrama diferencial S90 × S90D',
  S0S90SCATTERGRAM: 'Scattergrama S0 × S90',
}
const graphTitle = c => GRAPH_TITLES[String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')] ?? c

// ------------------------------------------------------------------- execução
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

  // 0) Limpeza dos RESULTADOS (idempotente). Os atendimentos NÃO são apagados:
  //    o trigger check_consultation_cfmv_retention (CFMV_RETENTION_5Y) proíbe —
  //    e está certo. Por isso o script é find-or-create, nunca delete+create.
  const { rows: old } = await q(
    `SELECT c.id FROM consultations c
       JOIN patients p ON p.id = c.patient_id
      WHERE c.clinic_id = $1 AND p.notes = $2`, [CLINIC_ID, TAG])
  for (const r of old) {
    await q('DELETE FROM exam_result_graphs WHERE clinic_id=$1 AND consultation_id=$2', [CLINIC_ID, r.id])
    await q('DELETE FROM exam_results      WHERE clinic_id=$1 AND consultation_id=$2', [CLINIC_ID, r.id])
  }
  console.log(`limpeza: resultados de ${old.length} atendimento(s) marcado(s) ${TAG} removidos`)
  if (DO_CLEAN) { await client.end(); return }

  // 1) massa real
  if (!existsSync(JSONL)) { console.error(`Arquivo não encontrado: ${JSONL}`); process.exit(1) }
  const lines = readFileSync(JSONL, 'utf8').trim().split('\n').filter(Boolean)
  const msgs = lines.map(l => JSON.parse(l).hl7)
  const parsedAll = msgs.map(parseORU)
  const samples = [...new Set(parsedAll.map(p => p.sample_id))]
  console.log(`HL7: ${lines.length} linha(s), amostra(s) distinta(s): ${samples.join(', ')}`)

  const hl7 = msgs[0]
  const parsed = parsedAll[0]
  console.log(`  amostra=${parsed.sample_id} aparelho=${parsed.device} analitos=${parsed.analytes.length} curvas=${parsed.graphs.length}`)
  if (parsed.analytes.length === 0) { console.error('HL7 sem analitos — abortando.'); process.exit(1) }

  // 2) liga a rotina do Laboratório na clínica (gate usa_laboratorio)
  await q(`UPDATE clinics
              SET flow_config = COALESCE(flow_config,'{}'::jsonb) || '{"usa_laboratorio": true}'::jsonb
            WHERE id = $1`, [CLINIC_ID])

  // 2b) Preenche SÓ o que estiver vazio no cadastro da clínica — o cabeçalho do
  //     laudo lê nome/logo/endereço/telefone direto de `clinics`. Não sobrescreve
  //     nada que já exista (nem o nome da clínica).
  await q(`UPDATE clinics SET
             address = COALESCE(address, 'Rua Garibaldi, 2248'),
             neighborhood = COALESCE(neighborhood, 'Centro'),
             city = COALESCE(city, 'Ribeirão Preto'),
             state = COALESCE(state, 'SP'),
             cep = COALESCE(cep, '14025-190'),
             phone = COALESCE(phone, '(16) 99215-5055')
           WHERE id = $1`, [CLINIC_ID])

  // 3) MV para assinar: pega um vet já existente na clínica (não cria usuário).
  const { rows: vets } = await q(
    `SELECT id, full_name, crmv FROM profiles
      WHERE clinic_id=$1 AND role IN ('vet','admin')
      ORDER BY (crmv IS NOT NULL) DESC, full_name LIMIT 1`, [CLINIC_ID])
  const vet = vets[0] ?? null
  if (vet && !vet.crmv) {
    // Só em DEV e só quando está vazio: sem CRMV o rodapé do laudo sai truncado.
    await q(`UPDATE profiles SET crmv = 'SP73073' WHERE id=$1 AND crmv IS NULL`, [vet.id])
    vet.crmv = 'SP73073'
    console.log('  (CRMV de demonstração gravado no perfil do MV — estava vazio)')
  }
  console.log(`MV: ${vet ? `${vet.full_name} (CRMV ${vet.crmv ?? '—'})` : 'nenhum encontrado — laudo sai sem assinatura'}`)

  // 4) Tutor de teste (find-or-create).
  // O marcador do seed vive em patients.notes, NÃO no nome — o nome do pet sai
  // impresso no laudo e não pode carregar sujeira de script.
  const tutorName = 'Tutor de Demonstração (seed laudo)'
  const { rows: tFound } = await q('SELECT id FROM tutors WHERE clinic_id=$1 AND name=$2 LIMIT 1', [CLINIC_ID, tutorName])
  const tutor = tFound[0] ?? (await q(
    `INSERT INTO tutors (clinic_id, name, email, phone)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [CLINIC_ID, tutorName, 'tutor.demo@exemplo.test', '(16) 99999-0000'])).rows[0]

  const lean = stripED(hl7)
  const rawForRow = lean.length <= 20000 ? lean : null
  const collected = parsed.observed_at ?? new Date().toISOString()

  // Dois atendimentos com o MESMO resultado real, um por estado do fluxo:
  // rascunho (acabou de chegar do aparelho, esperando o MV) e liberado (laudo
  // final assinado). Um pet por atendimento — há índice de 1 atendimento ativo
  // por pet.
  const scenarios = DO_RELEASE
    ? [{ key: 'released', pet: 'Mel', os: parsed.sample_id ?? '226404' }]
    : [
        { key: 'draft',    pet: 'Mel',  os: parsed.sample_id ?? '226404' },
        { key: 'released', pet: 'Thor', os: String(Number(parsed.sample_id ?? 226404) + 1) },
      ]

  const out = []
  for (const sc of scenarios) {
    const released = sc.key === 'released'
    const { rows: pFound } = await q(
      'SELECT id FROM patients WHERE clinic_id=$1 AND name=$2 AND notes=$3 LIMIT 1', [CLINIC_ID, sc.pet, TAG])
    const pet = pFound[0] ?? (await q(
      `INSERT INTO patients (clinic_id, tutor_id, name, species, breed, gender, neutered, birth_date, notes)
       VALUES ($1,$2,$3,'dog','SRD Canino',$4,true,$5,$6) RETURNING id`,
      [CLINIC_ID, tutor.id, sc.pet, sc.pet === 'Mel' ? 'female' : 'male', '2017-08-13', TAG])).rows[0]

    const { rows: cFound } = await q(
      'SELECT id FROM consultations WHERE clinic_id=$1 AND patient_id=$2 ORDER BY created_at LIMIT 1', [CLINIC_ID, pet.id])
    const cons = cFound[0] ?? (await q(
      `INSERT INTO consultations
         (clinic_id, patient_id, tutor_id, vet_id, status, os_number, visit_reason, created_at, appointment_date)
       VALUES ($1,$2,$3,$4,$5,$6,'exam',$7,$7) RETURNING id`,
      [CLINIC_ID, pet.id, tutor.id, vet?.id ?? null,
       released ? 'completed' : 'awaiting_lab_result', sc.os, collected])).rows[0]
    await q(`UPDATE consultations SET status=$3, os_number=$4, vet_id=COALESCE(vet_id,$5)
              WHERE clinic_id=$1 AND id=$2`,
      [CLINIC_ID, cons.id, released ? 'completed' : 'awaiting_lab_result', sc.os, vet?.id ?? null])

    // Analitos — exatamente como vieram do aparelho
    let n = 0
    for (const a of parsed.analytes) {
      await q(
        `INSERT INTO exam_results
           (clinic_id, consultation_id, panel, analyte_code, analyte_name, value_text, unit,
            ref_low, ref_high, ref_text, flag, status, source, created_by, released_by, released_at, raw_hl7)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'hl7',$13,$14,$15,$16)`,
        [CLINIC_ID, cons.id, 'Hemograma', a.code, a.name, a.value, a.unit,
         a.ref_low, a.ref_high, a.ref_text, a.flag,
         released ? 'released' : 'draft', vet?.id ?? null,
         released ? (vet?.id ?? null) : null, released ? new Date().toISOString() : null,
         n === 0 ? rawForRow : null])
      n++
    }

    // Curvas (histogramas/scattergramas) — PNG base64 do próprio aparelho
    let g = 0
    for (const gr of parsed.graphs) {
      await q(
        `INSERT INTO exam_result_graphs (clinic_id, consultation_id, code, title, mime, encoding, data, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'hl7')
         ON CONFLICT (consultation_id, code) DO UPDATE
           SET data = EXCLUDED.data, mime = EXCLUDED.mime, title = EXCLUDED.title`,
        [CLINIC_ID, cons.id, gr.code, graphTitle(gr.code), gr.mime, gr.encoding, gr.data])
      g++
    }
    out.push({ ...sc, id: cons.id, n, g })
  }

  console.log('')
  for (const o of out) {
    console.log(`${o.key.toUpperCase().padEnd(9)} OS ${o.os} · ${o.n} analitos + ${o.g} curvas`)
    console.log(`          /dashboard/exams/${o.id}/laudo`)
  }
  await client.end()
}

main().catch(async e => { console.error(e); try { await client.end() } catch {} ; process.exit(1) })
