// Semeia no banco DEV o laudo de BIOQUÍMICA da Clínica Animais.
//
// ORIGEM DOS DADOS — importa ser explícito, porque laudo não se inventa:
//
//  • O caminho normal é --jsonl: o HL7 REAL que o Sérium 200 (BIOBASE BK-200)
//    mandou ao agente-ponte em 01/10/2026 11:10 (amostra 7, pet BENTO 9S) e
//    que ficou preso na fila com "Servidor nao conectado!". Dele vêm valores,
//    unidades E as faixas de referência (OBX-7: 0.5~1.5, 10~88, 10~56, 2.2~3.9).
//
//  • Sem --jsonl, o script monta um ORU com os 4 valores lidos da tela do
//    aparelho e SEM faixa (OBX-7 vazio) — aí quem preenche é o catálogo da
//    clínica em biochem-report.ts, extraído dos laudos reais deles. Onde a
//    Animais também não publica faixa, o laudo imprime "—". Faixa de
//    referência veterinária não se inventa.
//
// Uso:
//   node scripts/seed-bioquimico-animais.mjs              # rascunho
//   node scripts/seed-bioquimico-animais.mjs --release    # já liberado
//   node scripts/seed-bioquimico-animais.mjs --jsonl C:/SysvetmaxLabAgent/pending-results.jsonl
//   node scripts/seed-bioquimico-animais.mjs --clean      # remove o que foi semeado
//
// Credenciais: .env.local do worktree (SUPABASE_DEV_DB_PASSWORD). Nunca hardcode.

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { config } from 'dotenv'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })

const CLINIC_ID = process.env.ANIMAIS_CLINIC_ID ?? 'ad1c3fca-d264-42c3-9a11-4b7ddac52a72'
const TAG = '[LAUDO-DEMO]'
const PANEL = 'Bioquímico'

const argv = process.argv.slice(2)
const args = new Set(argv)
const DO_CLEAN = args.has('--clean')
const DO_RELEASE = args.has('--release')
const JSONL = argv.includes('--jsonl') ? argv[argv.indexOf('--jsonl') + 1] : null

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

// ---------------------------------------------------------------- HL7 ------
// Resultados reais do Sérium 200, no formato ORU^R01 que o manual do BK-200
// documenta (OBX-3 item, OBX-5 valor, OBX-6 unidade, OBX-7 faixa). OBX-7 fica
// vazio: ver o cabeçalho deste arquivo.
const SERIUM_REAIS = [
  { code: 'CREAT', value: '0.74', unit: 'mg/dL' },
  { code: 'UREIA', value: '41.6', unit: 'mg/dL' },
  { code: 'ALBU',  value: '3.02', unit: 'g/dL'  },
  { code: 'TGP',   value: '46.5', unit: 'U/L'   },
]

const AMOSTRA = process.env.SERIUM_SAMPLE ?? '226501'

function montaHL7(amostra) {
  const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const linhas = [
    `MSH|^~\\&|BK-200|MAXBIO|SYSVETMAX|CLINICA|${ts}||ORU^R01|1|P|2.3.1`,
    'PID|1||||||0|',
    `OBR|1||${amostra}|BK-200^Bioquimico|||${ts}`,
  ]
  SERIUM_REAIS.forEach((a, i) => {
    // campo 7 (faixa) vazio de propósito — o aparelho ainda não nos disse a dele
    linhas.push(`OBX|${i + 1}|NM|${a.code}||${a.value}|${a.unit}||||F`)
  })
  return linhas.join('\r')
}

function parseORU(message) {
  const segs = message.split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean)
  const out = { sample_id: null, device: null, observed_at: null, analytes: [] }
  for (const seg of segs) {
    const f = seg.split('|')
    if (f[0] === 'MSH') out.device = out.device || (f[2] || '').trim() || null
    else if (f[0] === 'OBR') {
      out.sample_id = out.sample_id || ((f[3] ?? '').split('^')[0] || '').trim() || null
      const m = String(f[7] ?? '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/)
      if (m && !out.observed_at) out.observed_at = `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}`
    } else if (f[0] === 'OBX') {
      if ((f[2] ?? '').trim().toUpperCase() === 'ED') continue      // bioquímica não manda imagem
      const obsId = (f[3] ?? '').split('^')
      // BIOBASE BK-200: OBX-3 e id interno (`344`) e OBX-4 traz o nome (`CREAT`).
      const subId = (f[4] ?? '').trim()
      const usaSubId = /^\d+$/.test(obsId[0] ?? '') && subId !== '' && !/^\d+$/.test(subId)
      const ref = (f[7] ?? '').trim()
      const m = ref.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[-~]\s*(-?\d+(?:[.,]\d+)?)\s*$/)
      out.analytes.push({
        code: (usaSubId ? subId : obsId[0]) || null,
        name: (usaSubId ? subId : (obsId[1] || obsId[0])) || '',
        value: (f[5] ?? '').trim(),
        unit: (f[6] ?? '').trim() || null,
        ref_text: ref || null,
        ref_low:  m ? parseFloat(m[1].replace(',', '.')) : null,
        ref_high: m ? parseFloat(m[2].replace(',', '.')) : null,
        flag: ((f[8] ?? '').trim().toUpperCase() || null),
      })
    }
  }
  return out
}

/** Pega do arquivo do agente a primeira mensagem que seja de bioquímica. */
function doArquivo(caminho) {
  if (!existsSync(caminho)) { console.error(`Arquivo não encontrado: ${caminho}`); process.exit(1) }
  const msgs = readFileSync(caminho, 'utf8').trim().split('\n').filter(Boolean)
    .map(l => { try { const o = JSON.parse(l); return o?.payload?.hl7 ?? o?.hl7 ?? null } catch { return null } })
    .filter(Boolean)
  const bio = msgs.find(m => /BK-?200|MAXBIO|SERIUM/i.test(m))
  if (!bio) { console.error(`Nenhuma mensagem de bioquímica em ${caminho} (${msgs.length} mensagem(ns) lidas).`); process.exit(1) }
  return bio
}

// ------------------------------------------------------------------ execução
async function main() {
  await client.connect()
  const q = (sql, p) => client.query(sql, p)

  const hl7 = JSONL ? doArquivo(JSONL) : montaHL7(AMOSTRA)
  const parsed = parseORU(hl7)
  console.log(`HL7 ${JSONL ? `de ${JSONL}` : '(valores reais do Sérium, faixa a cargo do catálogo)'}`)
  console.log(`  amostra=${parsed.sample_id} aparelho=${parsed.device} analitos=${parsed.analytes.length}`)
  if (!parsed.analytes.length) { console.error('HL7 sem analitos — abortando.'); process.exit(1) }

  // Limpeza só dos resultados de BIOQUÍMICA dos pets marcados pelo seed.
  // O hemograma semeado antes continua intacto — é o que permite o laudo
  // combinado (hemograma + bioquímica) na mesma folha, como no modelo deles.
  const { rows: alvo } = await q(
    `SELECT c.id, p.name FROM consultations c
       JOIN patients p ON p.id = c.patient_id
      WHERE c.clinic_id = $1 AND p.notes = $2`, [CLINIC_ID, TAG])
  for (const r of alvo) {
    await q('DELETE FROM exam_results WHERE clinic_id=$1 AND consultation_id=$2 AND panel=$3', [CLINIC_ID, r.id, PANEL])
  }
  console.log(`limpeza: bioquímica removida de ${alvo.length} atendimento(s) ${TAG}`)
  if (DO_CLEAN) { await client.end(); return }

  await q(`UPDATE clinics
              SET flow_config = COALESCE(flow_config,'{}'::jsonb) || '{"usa_laboratorio": true}'::jsonb
            WHERE id = $1`, [CLINIC_ID])

  const { rows: vets } = await q(
    `SELECT id, full_name, crmv FROM profiles
      WHERE clinic_id=$1 AND role IN ('vet','admin')
      ORDER BY (crmv IS NOT NULL) DESC, full_name LIMIT 1`, [CLINIC_ID])
  const vet = vets[0] ?? null
  console.log(`MV: ${vet ? `${vet.full_name} (CRMV ${vet.crmv ?? '—'})` : 'nenhum — laudo sai sem assinatura'}`)

  const tutorName = 'Tutor de Demonstração (seed laudo)'
  const { rows: tFound } = await q('SELECT id FROM tutors WHERE clinic_id=$1 AND name=$2 LIMIT 1', [CLINIC_ID, tutorName])
  const tutor = tFound[0] ?? (await q(
    `INSERT INTO tutors (clinic_id, name, email, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
    [CLINIC_ID, tutorName, 'tutor.demo@exemplo.test', '(16) 99999-0000'])).rows[0]

  const collected = parsed.observed_at ?? new Date().toISOString()
  const rawForRow = hl7.length <= 20000 ? hl7 : null

  // Dois cenários, os dois que a Amanda vai ver na bancada:
  //  1. BENTO  — só bioquímica (foi o que o Sérium rodou)
  //  2. Mel    — bioquímica somada ao hemograma que já estava semeado, que é
  //              exatamente o "hemograma e bioquimicos" do modelo da Animais
  const cenarios = [
    { pet: 'Bento', os: parsed.sample_id ?? AMOSTRA, combinado: false, gender: 'male',   birth: '2017-01-20' },
    { pet: 'Mel',   os: null,                        combinado: true,  gender: 'female', birth: '2017-08-13' },
  ]

  const out = []
  for (const sc of cenarios) {
    const { rows: pFound } = await q(
      'SELECT id FROM patients WHERE clinic_id=$1 AND name=$2 AND notes=$3 LIMIT 1', [CLINIC_ID, sc.pet, TAG])
    if (sc.combinado && !pFound[0]) {
      console.log(`  (pulando ${sc.pet}: o hemograma ainda não foi semeado — rode seed-hemograma-animais.mjs antes)`)
      continue
    }
    const pet = pFound[0] ?? (await q(
      `INSERT INTO patients (clinic_id, tutor_id, name, species, breed, gender, neutered, birth_date, notes)
       VALUES ($1,$2,$3,'dog','SRD Canino',$4,true,$5,$6) RETURNING id`,
      [CLINIC_ID, tutor.id, sc.pet, sc.gender, sc.birth, TAG])).rows[0]

    const { rows: cFound } = await q(
      'SELECT id, os_number FROM consultations WHERE clinic_id=$1 AND patient_id=$2 ORDER BY created_at LIMIT 1',
      [CLINIC_ID, pet.id])
    const cons = cFound[0] ?? (await q(
      `INSERT INTO consultations
         (clinic_id, patient_id, tutor_id, vet_id, status, os_number, visit_reason, created_at, appointment_date)
       VALUES ($1,$2,$3,$4,'awaiting_lab_result',$5,'exam',$6,$6) RETURNING id, os_number`,
      [CLINIC_ID, pet.id, tutor.id, vet?.id ?? null, sc.os, collected])).rows[0]

    // No combinado o estado do hemograma manda: não rebaixar um laudo liberado.
    const { rows: est } = await q(
      `SELECT bool_or(status='released') liberado FROM exam_results
        WHERE clinic_id=$1 AND consultation_id=$2`, [CLINIC_ID, cons.id])
    const released = DO_RELEASE || Boolean(est[0]?.liberado)

    let n = 0
    for (const a of parsed.analytes) {
      await q(
        `INSERT INTO exam_results
           (clinic_id, consultation_id, panel, analyte_code, analyte_name, value_text, unit,
            ref_low, ref_high, ref_text, flag, status, source, created_by, released_by, released_at, raw_hl7)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'hl7',$13,$14,$15,$16)`,
        [CLINIC_ID, cons.id, PANEL, a.code, a.name || a.code, a.value, a.unit,
         a.ref_low, a.ref_high, a.ref_text, a.flag,
         released ? 'released' : 'draft', vet?.id ?? null,
         released ? (vet?.id ?? null) : null, released ? new Date().toISOString() : null,
         n === 0 ? rawForRow : null])
      n++
    }
    out.push({ pet: sc.pet, id: cons.id, n, combinado: sc.combinado, released, os: cons.os_number ?? sc.os })
  }

  console.log('')
  for (const o of out) {
    const tipo = o.combinado ? 'HEMOGRAMA + BIOQUÍMICA' : 'BIOQUÍMICA'
    console.log(`${o.pet.padEnd(6)} OS ${String(o.os).padEnd(8)} ${tipo} · ${o.n} analitos · ${o.released ? 'LIBERADO' : 'rascunho'}`)
    console.log(`       /dashboard/exams/${o.id}/laudo`)
  }
  await client.end()
}

main().catch(async e => { console.error(e); try { await client.end() } catch {} ; process.exit(1) })
