// Conserta o catálogo insurance_plan_coverage:
//   1. Adiciona prefixo "Petlove " aos plan_types (Leve → Petlove Leve, etc.)
//   2. Adiciona sinônimos de procedimentos comuns que faltavam no seed
//      (Consulta Veterinária, Consulta, etc.) para melhorar o match.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const SERVICE_KEY  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ─── 1) Adicionar prefixo "Petlove " aos plan_types ─────────────────────────
console.log('▶ Atualizando plan_type para incluir prefixo "Petlove "...')

const { data: providers } = await supabase
  .from('insurance_providers').select('id, name').ilike('name', 'petlove')

if (!providers || providers.length === 0) {
  console.log('Sem providers Petlove. Saindo.')
  process.exit(0)
}

const providerIds = providers.map(p => p.id)

const { data: existing } = await supabase
  .from('insurance_plan_coverage')
  .select('id, plan_type, provider_id')
  .in('provider_id', providerIds)
  .not('plan_type', 'ilike', 'petlove %')

console.log(`  ${existing?.length ?? 0} registros sem prefixo encontrados`)

let updated = 0
for (const row of existing ?? []) {
  const newPlanType = `Petlove ${row.plan_type}`
  const { error } = await supabase
    .from('insurance_plan_coverage')
    .update({ plan_type: newPlanType, updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) {
    if (error.code === '23505') {
      // já existe com novo nome — apaga o antigo
      await supabase.from('insurance_plan_coverage').delete().eq('id', row.id)
    } else {
      console.error(`  ✗ ${row.id}: ${error.message}`)
      continue
    }
  }
  updated++
}
console.log(`  ✓ ${updated} registros atualizados`)

// ─── 2) Sinônimos de procedimentos comuns ──────────────────────────────────
console.log('\n▶ Adicionando sinônimos de procedimentos comuns...')

const PLANS = ['Petlove Leve', 'Petlove Tranquilo', 'Petlove Ideal', 'Petlove Premium']
const SINONIMOS = [
  // Variações de "Consulta" — o que o caixa costuma cadastrar
  { p: 'Consulta Veterinária', cat: 'consulta', copay: 30, charger: 'clinic', planAll: true },
  { p: 'Consulta',             cat: 'consulta', copay: 30, charger: 'clinic', planAll: true },
  { p: 'Consulta Clínica',     cat: 'consulta', copay: 30, charger: 'clinic', planAll: true },
  { p: 'Atendimento Clínico',  cat: 'consulta', copay: 30, charger: 'clinic', planAll: true },
  // Retorno
  { p: 'Retorno', cat: 'consulta', copay: 0, charger: 'clinic', planAll: true },
  // Variações de vacinas
  { p: 'Vacina V8',  cat: 'vacina', copay: 25, charger: 'clinic', planAll: true },
  { p: 'Vacina V10', cat: 'vacina', copay: 25, charger: 'clinic', planAll: true },
  { p: 'Vacina V3',  cat: 'vacina', copay: 25, charger: 'clinic', planAll: true },
  { p: 'Vacina V4',  cat: 'vacina', copay: 25, charger: 'clinic', planAll: true },
  { p: 'Vacina V5',  cat: 'vacina', copay: 25, charger: 'clinic', planAll: true },
  { p: 'Vacina',     cat: 'vacina', copay: 25, charger: 'clinic', planAll: true },
]

const WAITING = {
  consulta: 45, vacina: 45, procedimento_clinico: 45,
  exame_simples: 60, exame_imagem: 60, especialista: 60,
  anestesia: 90, internacao: 90, cirurgia: 120, castracao: 120, outros: 60,
}

let synAdded = 0
for (const prov of providers) {
  for (const plan of PLANS) {
    for (const s of SINONIMOS) {
      const { error } = await supabase
        .from('insurance_plan_coverage')
        .upsert({
          provider_id:       prov.id,
          plan_type:         plan,
          procedure_pattern: s.p,
          coverage_category: s.cat,
          is_covered:        true,
          copay_amount:      s.copay,
          copay_charger:     s.charger,
          waiting_days:      WAITING[s.cat] ?? 60,
          notes:             'Sinônimo adicionado pós-seed',
          updated_at:        new Date().toISOString(),
        }, { onConflict: 'provider_id,plan_type,procedure_pattern' })
      if (error) { console.error(`  ✗ ${plan} / ${s.p}: ${error.message}`); continue }
      synAdded++
    }
  }
}
console.log(`  ✓ ${synAdded} sinônimos upserted`)

// ─── 3) Verificação ─────────────────────────────────────────────────────────
console.log('\n═══ Verificação ═══')
const { data: check } = await supabase
  .from('insurance_plan_coverage')
  .select('plan_type, procedure_pattern')
  .ilike('plan_type', 'Petlove Ideal')
  .ilike('procedure_pattern', '%consulta%')
  .order('procedure_pattern')

for (const r of check ?? []) {
  console.log(`  ${r.plan_type.padEnd(20)} ${r.procedure_pattern}`)
}
console.log(`\n✅ ${check?.length ?? 0} procedimentos com "consulta" no plano Petlove Ideal`)
