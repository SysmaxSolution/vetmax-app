/**
 * scripts/seed-director-pets.js
 * Restaura Bisteca, Bituca e Lion no banco do Diretor para teste.
 * Uso: node scripts/seed-director-pets.js
 */

const https = require('https')
const fs    = require('fs')
const path  = require('path')

// ── Carrega .env.local ────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local')
  if (!fs.existsSync(envPath)) { console.error('❌ .env.local não encontrado'); process.exit(1) }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env.local')
  process.exit(1)
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const url   = new URL(urlStr)
    const data  = body ? JSON.stringify(body) : null
    const opts  = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        'apikey':        SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
      },
    }
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data)

    const req = https.request(opts, res => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw || '[]') }) }
        catch { resolve({ status: res.statusCode, body: raw }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const base = SUPABASE_URL.replace(/\/$/, '')

  console.log('🔍 Buscando clínica e usuário admin...')

  // 1. Pega a primeira clínica disponível
  const clinicsRes = await request('GET', `${base}/rest/v1/clinics?select=id,name&limit=1`)
  if (!clinicsRes.body?.length) {
    console.error('❌ Nenhuma clínica encontrada. Certifique-se de ter feito o onboarding.')
    process.exit(1)
  }
  const clinic = clinicsRes.body[0]
  console.log(`   Clínica: ${clinic.name} (${clinic.id})`)

  // 2. Verifica se Bisteca, Bituca e Lion já existem
  const checkRes = await request('GET',
    `${base}/rest/v1/patients?select=id,name&clinic_id=eq.${clinic.id}&name=in.(Bisteca,Bituca,Lion)`
  )
  const existing = (checkRes.body || []).map(p => p.name)
  console.log(`   Já existem: ${existing.length ? existing.join(', ') : 'nenhum'}`)

  // 3. Verifica ou cria tutor "Djhames (Diretor)"
  let tutorId
  const tutorCheck = await request('GET',
    `${base}/rest/v1/tutors?select=id,name&clinic_id=eq.${clinic.id}&cpf=eq.00000000001&limit=1`
  )
  if (tutorCheck.body?.length) {
    tutorId = tutorCheck.body[0].id
    console.log(`   Tutor encontrado: ${tutorCheck.body[0].name} (${tutorId})`)
  } else {
    console.log('   Criando tutor "Djhames (Diretor)"...')
    const tutorRes = await request('POST', `${base}/rest/v1/tutors`, {
      clinic_id: clinic.id,
      name:      'Djhames (Diretor)',
      cpf:       '00000000001',
      phone:     '(11) 99999-0001',
      email:     'diretor@vetmax.app',
    })
    if (!tutorRes.body?.[0]?.id) {
      console.error('❌ Falha ao criar tutor:', tutorRes.body)
      process.exit(1)
    }
    tutorId = tutorRes.body[0].id
    console.log(`   Tutor criado: ${tutorId}`)
  }

  // 4. Pets a restaurar
  const petsToSeed = [
    {
      name:               'Bisteca',
      species:            'dog',
      breed:              'Vira-lata',
      reproductive_status:'Macho Castrado',
      behavior_tags:      ['calmo', 'sociável'],
      allergies:          null,
      chronic_diseases:   null,
    },
    {
      name:               'Bituca',
      species:            'cat',
      breed:              'SRD',
      reproductive_status:'Fêmea Castrada',
      behavior_tags:      ['tímido'],
      allergies:          'Amoxicilina',
      chronic_diseases:   null,
    },
    {
      name:               'Lion',
      species:            'dog',
      breed:              'Golden Retriever',
      reproductive_status:'Macho Inteiro',
      behavior_tags:      ['agitado', 'brincalhão'],
      allergies:          null,
      chronic_diseases:   'Hipotireoidismo',
    },
  ]

  let created = 0
  let skipped = 0

  for (const pet of petsToSeed) {
    if (existing.includes(pet.name)) {
      console.log(`   ⏭  ${pet.name} já existe — pulando`)
      skipped++
      continue
    }

    const res = await request('POST', `${base}/rest/v1/patients`, {
      ...pet,
      clinic_id: clinic.id,
      tutor_id:  tutorId,
    })

    if (res.body?.[0]?.id || res.status === 201) {
      console.log(`   ✅ ${pet.name} inserido com sucesso`)
      created++
    } else {
      console.error(`   ❌ Falha ao inserir ${pet.name}:`, res.body)
    }
  }

  console.log(`\n🐾 Seed concluído: ${created} criados, ${skipped} já existiam.`)
  console.log('   Recarregue /dashboard/patients para ver os pacientes.')
}

main().catch(err => { console.error('❌ Erro:', err); process.exit(1) })
