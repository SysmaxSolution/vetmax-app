// Popula, NO AMBIENTE DE TESTES (dev), a clínica "Animais" com a identidade real
// dela: nome, endereço, telefone, CNPJ, cidade/UF, bairro, CEP e a LOGO.
//
// Por que existe: o laudo de hemograma lê o cabeçalho direto de `clinics`
// (name / logo_url / address / neighborhood / city / state / cep / phone). Sem
// logo, o cabeçalho cai no fallback de texto verde — que não é a marca.
//
// Fonte dos dados: cadastro real da clínica na produção (leitura apenas). A logo
// é COPIADA para o bucket `clinic-logos` do DEV; o `logo_url` gravado aponta
// para o storage do DEV — nunca para produção.
//
// Uso:
//   node scripts/setup-clinica-animais-dev.mjs --clinic <uuid> --logo <arquivo.png>
//   node scripts/setup-clinica-animais-dev.mjs --clinic <uuid>            # sem trocar a logo
//   node scripts/setup-clinica-animais-dev.mjs --clinic <uuid> --dry-run
//
// Credenciais: .env.local do worktree (SUPABASE_DEV_DB_PASSWORD,
// SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL). Nunca hardcode.
//
// TRAVA DE SEGURANÇA: só roda se a URL do Supabase for a do projeto de DEV.

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })

const DEV_REF = 'claqxwckiihknclhmzvf'

// ------------------------------------------------------------------ argumentos
const argv = process.argv.slice(2)
const flag = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? d) : d }
const has = n => argv.includes(n)

const CLINIC_ID = flag('--clinic')
const LOGO_FILE = flag('--logo')
const DRY = has('--dry-run')

if (!CLINIC_ID) { console.error('Informe --clinic <uuid> (clínica alvo no DEV).'); process.exit(1) }

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL.includes(DEV_REF)) {
  console.error(`RECUSADO: NEXT_PUBLIC_SUPABASE_URL não é o projeto de DEV (${DEV_REF}). Este script só escreve em dev.`)
  process.exit(1)
}
if (!process.env.SUPABASE_DEV_DB_PASSWORD) { console.error('Falta SUPABASE_DEV_DB_PASSWORD no .env.local'); process.exit(1) }

// ------------------------------------------------- identidade real da Animais
// Cadastro da clínica na produção. `cep` não está preenchido lá; veio da
// papelaria oficial que a clínica enviou (mesmo endereço).
const ANIMAIS = {
  name:         'Animais Clínica Veterinária',
  cnpj:         '18.767.441/0001-89',
  phone:        '(16) 3931-5487',
  // Na produção o bairro está repetido dentro de `address` ("Rua São Paulo, 244
  // — Campos Elíseos") e também em `neighborhood`. O cabeçalho do laudo
  // concatena os dois, então aqui o endereço fica normalizado — mesmo endereço,
  // sem o bairro duplicado na linha impressa.
  address:      'Rua São Paulo, 244',
  neighborhood: 'Campos Elíseos',
  city:         'Ribeirão Preto',
  state:        'SP',
  cep:          '14085-010',
}

// Responsável técnico da clínica — assina o laudo. SEM imagem de assinatura:
// rubrica de pessoa real não se copia para ambiente de teste.
const VET = {
  full_name: 'Dr. Francisco Ferreira Develey',
  crmv:      'SP7065',                          // CHECK exige UF + 4..10 dígitos
  email:     'mv.develey@animais-teste.local',  // domínio inexistente, de propósito
  role:      'vet',
}

const client = new pg.Client({
  host:     process.env.SUPABASE_DEV_DB_HOST ?? 'aws-0-us-east-1.pooler.supabase.com',
  port:     Number(process.env.SUPABASE_DEV_DB_PORT ?? 6543),
  user:     process.env.SUPABASE_DEV_DB_USER ?? `postgres.${DEV_REF}`,
  password: process.env.SUPABASE_DEV_DB_PASSWORD,
  database: process.env.SUPABASE_DEV_DB_NAME ?? 'postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()
  const q = (sql, p) => client.query(sql, p)

  const { rows: found } = await q('SELECT id, name, logo_url FROM clinics WHERE id = $1', [CLINIC_ID])
  if (!found[0]) { console.error(`Clínica ${CLINIC_ID} não existe no DEV.`); process.exit(1) }
  console.log(`clínica alvo: ${found[0].name} (${CLINIC_ID})`)
  if (DRY) { console.log('--dry-run: nada foi escrito.'); await client.end(); return }

  // 1) Logo — copia o arquivo para o bucket clinic-logos do DEV.
  let logoUrl = found[0].logo_url
  if (LOGO_FILE) {
    if (!existsSync(LOGO_FILE)) { console.error(`Logo não encontrada: ${LOGO_FILE}`); process.exit(1) }
    if (!SERVICE) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY para subir a logo.'); process.exit(1) }
    const bytes = readFileSync(LOGO_FILE)
    const path = `${CLINIC_ID}/logo.png`
    const storage = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } }).storage
    const { error } = await storage.from('clinic-logos')
      .upload(path, bytes, { contentType: 'image/png', upsert: true })
    if (error) { console.error('Upload da logo falhou:', error.message); process.exit(1) }
    logoUrl = storage.from('clinic-logos').getPublicUrl(path).data.publicUrl
    console.log(`logo: ${bytes.length} bytes → clinic-logos/${path}`)
  }

  // 2) Cadastro + rotinas. O laudo imprime o nome da clínica em caixa alta ao
  //    lado da OS, então o nome TEM de ser o nome real da marca.
  await q(
    `UPDATE clinics SET
       name = $2, cnpj = $3, phone = $4, address = $5, neighborhood = $6,
       city = $7, state = $8, cep = $9, logo_url = COALESCE($10, logo_url),
       active_modules = (
         SELECT COALESCE(jsonb_agg(DISTINCT m), '[]'::jsonb)
           FROM jsonb_array_elements_text(
                  COALESCE(active_modules,'[]'::jsonb) || '["exams","triage","registry"]'::jsonb) AS m),
       flow_config = COALESCE(flow_config,'{}'::jsonb) || '{"usa_laboratorio": true}'::jsonb
     WHERE id = $1`,
    [CLINIC_ID, ANIMAIS.name, ANIMAIS.cnpj, ANIMAIS.phone, ANIMAIS.address,
     ANIMAIS.neighborhood, ANIMAIS.city, ANIMAIS.state, ANIMAIS.cep, logoUrl])
  console.log(`cadastro: ${ANIMAIS.name} · ${ANIMAIS.address} · ${ANIMAIS.city}/${ANIMAIS.state} · ${ANIMAIS.phone}`)

  // 2b) Gate de plano: o módulo Exames não é free e o catálogo
  //     (subscription_module_catalog) está vazio no DEV, então o gatekeeper só
  //     libera pelo que estiver contratado. Sem esta linha a tela do laudo cai
  //     no paywall para quem não é SysMax Suporte.
  await q(
    `INSERT INTO clinic_contracted_modules (clinic_id, module_key, is_active)
     VALUES ($1, 'exams', true)
     ON CONFLICT (clinic_id, module_key) DO UPDATE SET is_active = true`, [CLINIC_ID])
  console.log('módulo Exames contratado/ativo para esta clínica de teste')

  // 3) Médico Veterinário responsável técnico — assina o laudo liberado.
  const { rows: vFound } = await q(
    'SELECT id, full_name, crmv FROM profiles WHERE clinic_id=$1 AND full_name=$2 LIMIT 1',
    [CLINIC_ID, VET.full_name])
  let vetId = vFound[0]?.id ?? null
  if (!vetId) {
    if (!SERVICE) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY para criar o MV.'); process.exit(1) }
    const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } })
    const password = process.env.DEV_SEED_USER_PASSWORD ?? `Dev-${randomBytes(9).toString('base64url')}`
    const { data, error } = await admin.auth.admin.createUser({
      email: VET.email, password, email_confirm: true,
      user_metadata: { full_name: VET.full_name },
    })
    if (error) { console.error('Não consegui criar o usuário do MV:', error.message); process.exit(1) }
    vetId = data.user.id
    await q(
      `INSERT INTO profiles (id, clinic_id, full_name, role, crmv, is_active)
       VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT (id) DO UPDATE SET clinic_id=EXCLUDED.clinic_id, full_name=EXCLUDED.full_name,
                                      role=EXCLUDED.role, crmv=EXCLUDED.crmv, is_active=true`,
      [vetId, CLINIC_ID, VET.full_name, VET.role, VET.crmv])
    console.log(`MV criado: ${VET.full_name} (CRMV-SP ${VET.crmv.slice(2)}) · login ${VET.email}`)
    if (!process.env.DEV_SEED_USER_PASSWORD) console.log(`  senha gerada (DEV): ${password}`)
  } else {
    await q('UPDATE profiles SET crmv=$2, role=$3, is_active=true WHERE id=$1', [vetId, VET.crmv, VET.role])
    console.log(`MV já existia: ${VET.full_name} (CRMV-SP ${VET.crmv.slice(2)})`)
  }
  // Sem assinatura digitalizada: rubrica de pessoa real não vai para teste.
  await q('UPDATE profiles SET electronic_signature_url = NULL WHERE id = $1', [vetId])

  const { rows: chk } = await q(
    'SELECT name, logo_url, phone, address, neighborhood, city, state, cep, cnpj FROM clinics WHERE id=$1', [CLINIC_ID])
  console.log('\nconferência:', JSON.stringify(chk[0], null, 2))
  console.log(`MV id: ${vetId}`)
  await client.end()
}

main().catch(async e => { console.error(e); try { await client.end() } catch {} ; process.exit(1) })
