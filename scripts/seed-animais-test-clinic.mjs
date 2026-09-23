/**
 * Clínica de teste "Animais RP (Teste Layouts)" no banco DEV — dados 100%
 * fictícios (nunca copiados dos originais reais em anexos/Animais_Layouts)
 * para validar os 12 templates Canvas gerados por
 * scripts/seed-animais-layout-templates.mjs. Idempotente; manifest em
 * .tmp/animais-test-clinic-manifest.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()

const SYSMAX_EMAIL = 'sysmax@sysmaxsolutions.com'
const CLINIC_NAME = 'Animais RP (Teste Layouts)'
const manifest = { clinic_id: null, tutors: [], patients: [], consultations: [], triage: [], hospitalizations: [], exam_requests: [] }

// ── 1. Clínica ────────────────────────────────────────────────────────────
console.log('→ Clínica de teste…')
let clinicId
{
  const { rows } = await db.query(`SELECT id FROM clinics WHERE name = $1`, [CLINIC_NAME])
  if (rows.length) {
    clinicId = rows[0].id
    console.log(`  (já existe) ${CLINIC_NAME}`)
  } else {
    const { rows: [row] } = await db.query(
      `INSERT INTO clinics (name, status, address, city, state, phone, active_modules, working_days)
       VALUES ($1, 'active', 'Rua São Paulo, 244 — Campos Elíseos', 'Ribeirão Preto', 'SP', '(16) 3931-0000',
               $2, '{1,2,3,4,5,6}')
       RETURNING id`,
      [CLINIC_NAME, JSON.stringify(['reception', 'triage', 'consultation', 'exams', 'hospitalization', 'cashier', 'patients'])])
    clinicId = row.id
    console.log(`  ✓ ${CLINIC_NAME}`)
  }
  manifest.clinic_id = clinicId
  await db.query(
    `INSERT INTO tenant_subscriptions (clinic_id, plan_name, status)
     VALUES ($1, 'enterprise', 'active')
     ON CONFLICT (clinic_id) DO UPDATE SET plan_name = 'enterprise', status = 'active'`,
    [clinicId])
}

// ── 2. Vínculo do sysmax + perfil com CRMV (para vet.name/vet.crmv) ────────
console.log('→ Vinculando sysmax + CRMV…')
let sysmaxId
{
  const { rows } = await db.query(`SELECT id FROM auth.users WHERE email = $1`, [SYSMAX_EMAIL])
  if (!rows.length) throw new Error(`Usuário ${SYSMAX_EMAIL} não encontrado no dev`)
  sysmaxId = rows[0].id
  await db.query(
    `UPDATE profiles SET full_name = COALESCE(NULLIF(full_name, ''), 'Dr. Sysmax Teste'), crmv = COALESCE(NULLIF(crmv, ''), 'SP99999') WHERE id = $1`,
    [sysmaxId])
  await db.query(
    `INSERT INTO user_clinics (user_id, clinic_id, role)
     SELECT $1, $2, 'admin' WHERE NOT EXISTS (SELECT 1 FROM user_clinics WHERE user_id=$1 AND clinic_id=$2)`,
    [sysmaxId, clinicId])
  console.log('  ✓ sysmax vinculado, CRMV garantido')
}

// ── 3. Tutores + pets (casos normais + 1 caso "estressante") ───────────────
console.log('→ Tutores, pets, consultas, triagem…')

const CASES = [
  {
    tutor: {
      name: 'Roberto Amaral Pires', cpf: '111.111.111-11', phone: '(16) 99911-2233',
      address: 'Av. Presidente Vargas, 1500', street: 'Av. Presidente Vargas', address_number: '1500',
      neighborhood: 'Centro', city: 'Ribeirão Preto', state: 'SP', cep: '14010-000',
    },
    pet: { name: 'Nina', species: 'dog', breed: 'Dachshund', gender: 'female', birth_date: '2019-02-10', color: 'Chocolate', microchip: '900123000111222' },
    consultation: {
      visit_reason: 'Encaminhamento para tomografia — suspeita de hérnia de disco', visitReasonEnum: 'exam',
      anamnesis: 'Paresia de membros pélvicos há 48h, dor à palpação da coluna toracolombar.',
      weight: 7.4, temperature: 38.6,
    },
    exams: ['Tomografia Computadorizada — coluna toracolombar', 'Radiografia — coluna toracolombar'],
  },
  {
    // Caso ESTRESSE: nome de tutor muito longo, endereço longo, anamnese longa —
    // força overflow real nos blocos de identificação e nos campos de texto livre.
    tutor: {
      name: 'Maria de Fátima Nascimento Bittencourt Cavalcanti de Assunção Rodrigues',
      cpf: '222.222.222-22', phone: '(16) 98877-6655',
      address: 'Rua Comendador Prudêncio Coelho de Almeida Prado Guimarães, número 3450, Apartamento 1502, Bloco B, Condomínio Residencial Jardins do Vale',
      street: 'Rua Comendador Prudêncio Coelho de Almeida Prado Guimarães', address_number: '3450',
      neighborhood: 'Jardim Sumaré', city: 'Ribeirão Preto', state: 'SP', cep: '14025-340',
    },
    pet: {
      name: 'Bartolomeu Segundo do Nascimento Cavalcanti', // nome de pet também longo, de propósito
      species: 'dog', breed: 'Bulldog Francês', gender: 'male', birth_date: '2015-06-01', color: 'Atigrado', microchip: '900123000333444',
    },
    consultation: {
      visit_reason: 'Avaliação pré-anestésica para ressonância magnética', visitReasonEnum: 'exam',
      anamnesis: 'Tutora relata que o animal, de raça braquicefálica, apresenta histórico de ronco intenso durante o sono, episódios ocasionais de dificuldade respiratória em dias de calor extremo, intolerância a exercícios físicos prolongados, e que há aproximadamente três semanas começou a apresentar claudicação intermitente do membro pélvico esquerdo, sem histórico de trauma relatado, o que motivou a indicação de exame de imagem avançado (ressonância magnética) para investigação de possível compressão medular ou alteração ortopédica associada, sendo que o animal já foi submetido anteriormente a dois procedimentos cirúrgicos de menor porte sob anestesia geral sem intercorrências relevantes, mas a tutora manifesta apreensão quanto ao risco anestésico dado o histórico respiratório da raça.',
      weight: 14.2, temperature: 38.9,
    },
    exams: ['Ressonância Magnética — coluna e membros'],
  },
  {
    tutor: {
      name: 'Fernanda Luz Carvalho', cpf: '333.333.333-33', phone: '(16) 99844-5566',
      address: 'Rua Álvares Cabral, 830', street: 'Rua Álvares Cabral', address_number: '830',
      neighborhood: 'Vila Tibério', city: 'Ribeirão Preto', state: 'SP', cep: '14050-000',
    },
    pet: { name: 'Simba', species: 'cat', breed: 'Maine Coon', gender: 'male', birth_date: '2013-07-01', color: 'Ruivo tabby', microchip: '900123000555666' },
    consultation: {
      visit_reason: 'internacao', visitReasonEnum: 'emergency',
      anamnesis: 'Insuficiência renal crônica agudizada, internado para fluidoterapia e monitoramento.',
      weight: 4.8, temperature: 37.9,
    },
    hospitalization: { reason: 'Insuficiência renal crônica agudizada — fluidoterapia', admission_reason: 'IRC agudizada', care_level: 'uti' },
  },
]

for (const c of CASES) {
  const { rows: tExist } = await db.query(`SELECT id FROM tutors WHERE clinic_id=$1 AND name=$2`, [clinicId, c.tutor.name])
  let tutorId = tExist[0]?.id
  if (!tutorId) {
    const { rows: [t] } = await db.query(
      `INSERT INTO tutors (clinic_id, name, cpf, phone, address, street, address_number, neighborhood, city, state, cep, consent_given, consent_given_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,now()) RETURNING id`,
      [clinicId, c.tutor.name, c.tutor.cpf, c.tutor.phone, c.tutor.address, c.tutor.street, c.tutor.address_number, c.tutor.neighborhood, c.tutor.city, c.tutor.state, c.tutor.cep])
    tutorId = t.id
  }
  manifest.tutors.push(tutorId)

  const { rows: pExist } = await db.query(`SELECT id FROM patients WHERE clinic_id=$1 AND tutor_id=$2 AND name=$3`, [clinicId, tutorId, c.pet.name])
  let petId = pExist[0]?.id
  if (!petId) {
    const { rows: [p] } = await db.query(
      `INSERT INTO patients (clinic_id, tutor_id, name, species, breed, gender, birth_date, color, microchip, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[TESTE LAYOUTS — dados fictícios]') RETURNING id`,
      [clinicId, tutorId, c.pet.name, c.pet.species, c.pet.breed, c.pet.gender, c.pet.birth_date, c.pet.color, c.pet.microchip])
    petId = p.id
  }
  manifest.patients.push(petId)

  const { rows: cExist } = await db.query(`SELECT id FROM consultations WHERE clinic_id=$1 AND patient_id=$2 LIMIT 1`, [clinicId, petId])
  let consultId = cExist[0]?.id
  if (!consultId) {
    const { rows: [con] } = await db.query(
      `INSERT INTO consultations (clinic_id, patient_id, tutor_id, vet_id, status, visit_reason, reason, anamnesis, weight, temperature, appointment_date, os_number)
       VALUES ($1,$2,$3,$4,'in_progress',$5,$6,$7,$8,$9,now(),$10) RETURNING id`,
      [clinicId, petId, tutorId, sysmaxId, c.consultation.visitReasonEnum, c.consultation.visit_reason, c.consultation.anamnesis, c.consultation.weight, c.consultation.temperature, `OS-${Math.floor(Math.random() * 90000 + 10000)}`])
    consultId = con.id
  }
  manifest.consultations.push(consultId)

  const { rows: trExist } = await db.query(`SELECT id FROM triage_records WHERE clinic_id=$1 AND patient_id=$2 LIMIT 1`, [clinicId, petId])
  if (!trExist.length) {
    const { rows: [tr] } = await db.query(
      `INSERT INTO triage_records (clinic_id, patient_id, tutor_id, consultation_id, status, chief_complaint, weight_kg, temperature_celsius, anamnesis, triaged_by)
       VALUES ($1,$2,$3,$4,'completed',$5,$6,$7,$8,$9) RETURNING id`,
      [clinicId, petId, tutorId, consultId, c.consultation.visit_reason, c.consultation.weight, c.consultation.temperature, c.consultation.anamnesis, sysmaxId])
    manifest.triage.push(tr.id)
  }

  if (c.exams) {
    for (const examType of c.exams) {
      const { rows: eExist } = await db.query(`SELECT id FROM exam_requests WHERE clinic_id=$1 AND patient_id=$2 AND exam_type=$3`, [clinicId, petId, examType])
      if (!eExist.length) {
        const { rows: [ex] } = await db.query(
          `INSERT INTO exam_requests (clinic_id, patient_id, tutor_id, consultation_id, exam_type, status, requested_by, requested_at)
           VALUES ($1,$2,$3,$4,$5,'pending',$6,now()) RETURNING id`,
          [clinicId, petId, tutorId, consultId, examType, sysmaxId])
        manifest.exam_requests.push(ex.id)
      }
    }
  }

  if (c.hospitalization) {
    const { rows: hExist } = await db.query(`SELECT id FROM hospitalizations WHERE clinic_id=$1 AND patient_id=$2 LIMIT 1`, [clinicId, petId])
    if (!hExist.length) {
      const { rows: [h] } = await db.query(
        `INSERT INTO hospitalizations (clinic_id, patient_id, consultation_id, tutor_id, status, reason, admission_reason, care_level, weight_at_admission, attending_vet_id)
         VALUES ($1,$2,$3,$4,'icu',$5,$6,$7,$8,$9) RETURNING id`,
        [clinicId, petId, consultId, tutorId, c.hospitalization.reason, c.hospitalization.admission_reason, c.hospitalization.care_level, c.consultation.weight, sysmaxId])
      manifest.hospitalizations.push(h.id)
    }
  }

  console.log(`  ✓ ${c.pet.name.slice(0, 30)}${c.pet.name.length > 30 ? '…' : ''} (tutor: ${c.tutor.name.slice(0, 30)}${c.tutor.name.length > 30 ? '…' : ''})`)
}

writeFileSync('.tmp/animais-test-clinic-manifest.json', JSON.stringify(manifest, null, 2))
console.log('\n✓ Clínica de teste pronta:', clinicId)
console.log('  Manifest: .tmp/animais-test-clinic-manifest.json')
await db.end()
