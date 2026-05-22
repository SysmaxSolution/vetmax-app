// Seed inicial do catálogo de cobertura Petlove.
//
// Baseado em informações públicas da Petlove (FAQ Zendesk + página oficial dos
// planos). Será refinado automaticamente conforme remessas reais vão chegando.
//
// Categorias e carências (oficial Petlove):
//   • Consultas / vacinas / exames básicos: 45-90 dias → uso 60 dias como média
//   • Cirurgias / castração / internação: até 120 dias

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const SERVICE_KEY  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ─── 1) Localizar todos os provider_id da Petlove (multi-clínica) ─────────────
const { data: providers } = await supabase
  .from('insurance_providers').select('id, clinic_id, name').ilike('name', 'petlove')

if (!providers || providers.length === 0) {
  console.log('Nenhum provider Petlove encontrado.')
  process.exit(0)
}
console.log(`▶ ${providers.length} providers Petlove (1 por clínica)`)

// ─── 2) Modelo de cobertura por plano ──────────────────────────────────────────
// Cada item: procedure_pattern, category, copay_amount (média), copay_charger
//   copay_charger='clinic' = clínica cobra o tutor no caixa (consultas, vacinas, procedimentos)
//   copay_charger='provider' = Petlove cobra automático no cartão (exames, anestesia)

const CONSULTAS = [
  { p: 'Consulta Clínico Geral',                          cat: 'consulta',             copay: 30, charger: 'clinic' },
  { p: 'Consulta Clínico Geral para Definição do Protocolo', cat: 'consulta',          copay: 30, charger: 'clinic' },
  { p: 'Consulta com Especialista',                       cat: 'especialista',         copay: 50, charger: 'clinic' },
  { p: 'Consulta Cardiologista',                          cat: 'especialista',         copay: 50, charger: 'clinic' },
  { p: 'Consulta Dermatologista',                         cat: 'especialista',         copay: 50, charger: 'clinic' },
  { p: 'Consulta Oftalmologista',                         cat: 'especialista',         copay: 50, charger: 'clinic' },
]

const VACINAS = [
  { p: 'Vacina Antirrábica',                              cat: 'vacina',               copay: 25, charger: 'clinic' },
  { p: 'Vacina Polivalente / V7 / V8 / V10',              cat: 'vacina',               copay: 25, charger: 'clinic' },
  { p: 'Vacina Tríplice (V3) / Quádrupla (V4)',           cat: 'vacina',               copay: 25, charger: 'clinic' },
  { p: 'Vacina Bordetella',                               cat: 'vacina',               copay: 25, charger: 'clinic' },
  { p: 'Vacina Giárdia',                                  cat: 'vacina',               copay: 25, charger: 'clinic' },
]

const PROC_CLINICOS = [
  { p: 'Aplicação de Injeção Subcutânea ou Intramuscular', cat: 'procedimento_clinico', copay: 15, charger: 'clinic' },
  { p: 'Aplicação Intravenosa (IV) - Com Medicação',       cat: 'procedimento_clinico', copay: 22, charger: 'clinic' },
  { p: 'Fluidoterapia / Soroterapia - Soro fisiológico',   cat: 'procedimento_clinico', copay: 22, charger: 'clinic' },
  { p: 'Microchipagem',                                    cat: 'procedimento_clinico', copay: 0,  charger: 'clinic' },
  { p: 'Coleta de material para exames cobertos',          cat: 'exame_simples',        copay: 12, charger: 'provider' },
  { p: 'Glicemia fita',                                    cat: 'exame_simples',        copay: 0,  charger: 'clinic' },
  { p: 'Locação de sala para atendimento volante',         cat: 'procedimento_clinico', copay: 0,  charger: 'clinic' },
  { p: 'Sedação/tranquilização',                           cat: 'anestesia',            copay: 0,  charger: 'provider' },
]

const EXAMES_IMAGEM = [
  { p: 'Ultrassonografia',                                cat: 'exame_imagem',         copay: 50, charger: 'provider' },
  { p: 'Raio-X',                                          cat: 'exame_imagem',         copay: 40, charger: 'provider' },
  { p: 'Eletrocardiograma',                               cat: 'exame_imagem',         copay: 45, charger: 'provider' },
  { p: 'Ecocardiograma',                                  cat: 'exame_imagem',         copay: 80, charger: 'provider' },
]

const CIRURGIAS = [
  { p: 'Castração',                                       cat: 'castracao',            copay: 200, charger: 'mixed' },
  { p: 'Cirurgia',                                        cat: 'cirurgia',             copay: 250, charger: 'mixed' },
  { p: 'Anestesia Inalatória',                            cat: 'anestesia',            copay: 100, charger: 'provider' },
  { p: 'Internação',                                      cat: 'internacao',           copay: 150, charger: 'mixed' },
]

// ─── 3) Matriz de planos × cobertura ──────────────────────────────────────────
// Cobertura por plano (true = coberto):
//   Leve:      consultas + vacinas + procedimentos clínicos + exames simples
//   Tranquilo: + exames de imagem + plantão
//   Ideal:     + especialistas + cirurgias + castração + anestesia + internação
//   Premium:   Ideal completo (cobre tudo)

// Plan names with the "Petlove " prefix to match pet_insurance.plan_type
// (which comes from the remittance file as "Petlove Leve", "Petlove Ideal", etc).
const COVERAGE = {
  'Petlove Leve':      { consulta: true, vacina: true, exame_simples: true, exame_imagem: false, procedimento_clinico: true,  especialista: false, cirurgia: false, castracao: false, anestesia: false, internacao: false },
  'Petlove Tranquilo': { consulta: true, vacina: true, exame_simples: true, exame_imagem: true,  procedimento_clinico: true,  especialista: false, cirurgia: false, castracao: false, anestesia: false, internacao: false },
  'Petlove Ideal':     { consulta: true, vacina: true, exame_simples: true, exame_imagem: true,  procedimento_clinico: true,  especialista: true,  cirurgia: true,  castracao: true,  anestesia: true,  internacao: true  },
  'Petlove Premium':   { consulta: true, vacina: true, exame_simples: true, exame_imagem: true,  procedimento_clinico: true,  especialista: true,  cirurgia: true,  castracao: true,  anestesia: true,  internacao: true  },
}

// Carência (dias) por categoria — média dos prazos oficiais
const WAITING = {
  consulta:             45,
  vacina:               45,
  procedimento_clinico: 45,
  exame_simples:        60,
  exame_imagem:         60,
  especialista:         60,
  anestesia:            90,
  internacao:           90,
  cirurgia:             120,
  castracao:            120,
  outros:               60,
}

const ALL_PROCS = [...CONSULTAS, ...VACINAS, ...PROC_CLINICOS, ...EXAMES_IMAGEM, ...CIRURGIAS]
const PLANS = Object.keys(COVERAGE)

// ─── 4) Insert/upsert por provider × plan × procedimento ──────────────────────
let upserted = 0
for (const prov of providers) {
  for (const plan of PLANS) {
    for (const proc of ALL_PROCS) {
      const covered = COVERAGE[plan][proc.cat] ?? false
      const waiting = WAITING[proc.cat] ?? 60
      const { error } = await supabase
        .from('insurance_plan_coverage')
        .upsert({
          provider_id:        prov.id,
          plan_type:          plan,
          procedure_pattern:  proc.p,
          coverage_category:  proc.cat,
          is_covered:         covered,
          copay_amount:       proc.copay,
          copay_charger:      proc.charger,
          waiting_days:       waiting,
          notes:              'Seed inicial · refinado a cada remessa Petlove fechada',
          updated_at:         new Date().toISOString(),
        }, { onConflict: 'provider_id,plan_type,procedure_pattern' })
      if (error) { console.error('  ✗', proc.p, plan, error.message); continue }
      upserted++
    }
  }
}

console.log(`\n✅ ${upserted} registros de cobertura semeados (${providers.length} clínicas × ${PLANS.length} planos × ${ALL_PROCS.length} procedimentos)`)
