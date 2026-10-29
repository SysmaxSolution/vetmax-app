// FASE 6 da virada — ativa as rotinas por clinic_id em PRODUÇÃO.
// Idempotente: pode rodar N vezes; só mostra o que mudou.
// Credenciais do env (C:/SysMax/.env.local). Nunca imprime segredo.
//
// Uso:
//   node scripts/prod-enable-animais-flags.mjs --confirm=yivjuhurcadxtllmkkqd [--apply]
//
// Regras (decisões do Diretor em 2026-09-24):
//   • Todos os módulos desenvolvidos estão inclusos na mensalidade da Animais.
//   • `vaccine_recall_enabled` fica DESLIGADO em todas (ligar dispara WhatsApp aos tutores).
//   • CLÍNICA CAT & DOG não recebe NENHUMA flag ligada — nem é tocada por este script.
//   • `usa_boleto` e `portal_enabled` ficam desligados por dependência técnica
//     (conta Sicoob com certificado A1 / validação do portal em produção) — item 5.3 do runbook.
import { createRequire } from 'module'

const require = createRequire('C:/SysMax/package.json')
require('dotenv').config({ path: 'C:/SysMax/.env.local' })
const { Client } = require('pg')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const arg = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=')

const EXPECTED_REF = 'yivjuhurcadxtllmkkqd'
if (arg('confirm') !== EXPECTED_REF) { console.error(`ABORTADO: passe --confirm=${EXPECTED_REF}`); process.exit(1) }
const u = new URL(process.env.DATABASE_URL); u.port = '5432'
if (!u.username.endsWith(EXPECTED_REF)) { console.error(`ABORTADO: alvo ${u.username} != ${EXPECTED_REF}`); process.exit(1) }

const CAT_DOG = '032976c0-9171-4496-8601-db0b531670c8' // NUNCA tocar

const PLAN = [
  {
    id: '3c6d06ad-17ce-4811-a7df-6092bd3fb8c6',
    nome: 'Animais Clínica Veterinária',
    papel: 'operação: clínica + laboratório de referência + financeiro',
    flags: {
      animais_foundation: true,        // multi-CNPJ, OS, tabelas de preço, parceiras (0421-0425)
      usa_laboratorio: true,           // analitos/HL7 dentro do exame (0444/0459)
      usa_fluxo_rejeicao_exame: true,  // exame não realizado não gera título (0468/0469)
      usa_convenios: true,             // Vetplan / AVA / Petlove
      usa_treinamento: true,           // Academia (0472) — vídeos já no bucket
      usa_boleto: false,               // pendente: conta Sicoob com certificado A1
      usa_imagem: false,               // a imagem é do CNPJ 2b7a90c3
      portal_enabled: false,           // pendente: validar o portal em produção
      vaccine_recall_enabled: false,   // DECISÃO DO DIRETOR: permanece desligado
    },
    addModules: ['petlove_reconciliation'], // Conciliação de Convênios
  },
  {
    id: '2b7a90c3-fb5a-40d3-bc1a-e3f78e0756f4',
    nome: 'Animais Diagnóstico por Imagem',
    papel: 'CNPJ de imagem: entrega de DICOM/laudo ao vet solicitante',
    flags: {
      animais_foundation: true,
      usa_imagem: true,                // /dashboard/imaging + visualizador DICOM (0446/0450)
      portal_enabled: false,
      vaccine_recall_enabled: false,
    },
    addModules: ['exams'],             // DECISÃO DO DIRETOR: usa_imagem exige o módulo exams
  },
  {
    id: '7be4d7bb-0f70-453c-bf4f-fe37bf24a9fb',
    nome: 'Animais Pet',
    papel: 'pet shop / banho e tosa — só entra no rateio multi-empresa',
    flags: { animais_foundation: true, vaccine_recall_enabled: false },
    addModules: [],
  },
]

// Convênios a cadastrar na clínica operacional (produção tem 0 hoje).
const PROVIDERS = [
  { clinic_id: '3c6d06ad-17ce-4811-a7df-6092bd3fb8c6', name: 'Vetplan', receipt_mode: 'convenio_repasse' },
  { clinic_id: '3c6d06ad-17ce-4811-a7df-6092bd3fb8c6', name: 'AVA',     receipt_mode: 'ong_guia' },
]

const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } })
await c.connect()
console.log(`alvo: ${u.hostname}:${u.port} user=${u.username} · modo ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

for (const p of PLAN) {
  if (p.id === CAT_DOG) { console.error('ABORTADO: o plano tentou tocar a Cat & Dog.'); process.exit(1) }
  const { rows } = await c.query('select id, name, flow_config, active_modules from clinics where id=$1', [p.id])
  if (rows.length !== 1) { console.error(`ABORTADO: clínica ${p.id} não encontrada.`); process.exit(1) }
  const cur = rows[0]
  if (cur.name !== p.nome) { console.error(`ABORTADO: nome divergente para ${p.id}: banco="${cur.name}" plano="${p.nome}"`); process.exit(1) }

  const flowAtual = cur.flow_config || {}
  const mudancas = Object.entries(p.flags).filter(([k, v]) => flowAtual[k] !== v)
  const modsAtuais = cur.active_modules || []
  const modsNovos = p.addModules.filter((m) => !modsAtuais.includes(m))

  console.log(`── ${p.nome} (${p.papel})`)
  if (mudancas.length === 0 && modsNovos.length === 0) { console.log('   nada a mudar (já no estado desejado)\n'); continue }
  mudancas.forEach(([k, v]) => console.log(`   flag ${k}: ${JSON.stringify(flowAtual[k])} → ${v}`))
  modsNovos.forEach((m) => console.log(`   módulo + ${m}`))

  if (APPLY) {
    await c.query('begin')
    try {
      await c.query(
        `update clinics set flow_config = coalesce(flow_config,'{}'::jsonb) || $2::jsonb, updated_at = now() where id = $1`,
        [p.id, JSON.stringify(p.flags)]
      )
      if (modsNovos.length) {
        // active_modules é JSONB (array). modsNovos já exclui o que existe → append preserva ordem e é idempotente.
        await c.query(
          `update clinics set active_modules = coalesce(active_modules,'[]'::jsonb) || $2::jsonb, updated_at = now() where id = $1`,
          [p.id, JSON.stringify(modsNovos)]
        )
      }
      await c.query('commit')
      console.log('   ✓ aplicado')
    } catch (e) { await c.query('rollback'); console.error(`   ✗ ERRO: ${e.message}`); process.exit(1) }
  }
  console.log('')
}

console.log('── Convênios (insurance_providers)')
for (const pr of PROVIDERS) {
  const { rows } = await c.query('select id, receipt_mode from insurance_providers where clinic_id=$1 and name=$2', [pr.clinic_id, pr.name])
  if (rows.length) { console.log(`   ${pr.name}: já existe (${rows[0].receipt_mode})`); continue }
  console.log(`   ${pr.name}: criar (receipt_mode=${pr.receipt_mode})`)
  if (APPLY) {
    await c.query(
      `insert into insurance_providers (clinic_id, name, receipt_mode, is_active) values ($1,$2,$3,true)`,
      [pr.clinic_id, pr.name, pr.receipt_mode]
    )
    console.log('   ✓ criado')
  }
}

console.log('\n── Estado final das 4 clínicas')
const fin = await c.query('select id, name, flow_config, active_modules from clinics order by created_at')
for (const r of fin.rows) {
  const marca = r.id === CAT_DOG ? '  [NÃO TOCADA]' : ''
  console.log(`\n${r.name}${marca}`)
  console.log(`  flow_config: ${JSON.stringify(r.flow_config)}`)
  console.log(`  módulos (${(r.active_modules || []).length}): ${(r.active_modules || []).join(', ')}`)
}
await c.end()
