// Diagnóstico do bot WhatsApp da clínica Almavet
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const SERVICE_KEY  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Achar Almavet pelo prefixo 218e5d8f
const { data: clinics } = await supabase
  .from('clinics')
  .select('id, name, created_at')
  .ilike('name', '%almavet%')

console.log('═══ Clínica(s) Almavet ═══')
for (const c of clinics ?? []) console.log(`  ${c.id} · ${c.name}`)

const clinic = (clinics ?? [])[0]
if (!clinic) { console.log('NÃO ENCONTRADA'); process.exit(0) }
const CID = clinic.id
console.log(`  instance esperada: vet${CID.replace(/-/g,'').slice(0,8)}`)

// Bot config
const { data: cfg, error: cfgErr } = await supabase
  .from('whatsapp_bot_config')
  .select('*')
  .eq('clinic_id', CID)
  .maybeSingle()
console.log('\n═══ whatsapp_bot_config ═══')
if (cfgErr) console.log('  erro:', cfgErr.message)
if (cfg) {
  console.log(`  is_active: ${cfg.is_active}`)
  console.log(`  can_book: ${cfg.can_book} · can_inform_prices: ${cfg.can_inform_prices}`)
  console.log(`  working_hours: ${cfg.working_hours_start}–${cfg.working_hours_end}`)
  console.log(`  personality_prompt: ${(cfg.personality_prompt||'').slice(0,80)}...`)
} else console.log('  (sem registro de bot_config)')

// Settings de conexão
const { data: set } = await supabase
  .from('clinic_whatsapp_settings')
  .select('*')
  .eq('clinic_id', CID)
  .maybeSingle()
console.log('\n═══ clinic_whatsapp_settings ═══')
if (set) {
  for (const k of Object.keys(set)) {
    let v = set[k]
    if (typeof v === 'string' && v.length > 60) v = v.slice(0,60)+'…'
    console.log(`  ${k}: ${v}`)
  }
} else console.log('  (sem registro)')

// Atividade recente de mensagens
const { data: convs } = await supabase
  .from('whatsapp_conversations')
  .select('id, status, contact_phone, last_message_at, updated_at')
  .eq('clinic_id', CID)
  .order('last_message_at', { ascending: false, nullsFirst: false })
  .limit(8)
console.log('\n═══ Conversas recentes (top 8) ═══')
for (const c of convs ?? []) {
  console.log(`  ${(c.last_message_at||c.updated_at||'').slice(0,19)} · ${String(c.status).padEnd(6)} · ${c.contact_phone}`)
}

// Última mensagem do bot (direção saída) para provar que está respondendo
const convIds = (convs ?? []).map(c => c.id)
if (convIds.length) {
  const { data: msgs } = await supabase
    .from('whatsapp_messages')
    .select('direction, sender_type, content, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })
    .limit(12)
  console.log('\n═══ Últimas 12 mensagens (todas conversas top) ═══')
  for (const m of msgs ?? []) {
    console.log(`  ${m.created_at.slice(0,19)} · ${String(m.direction||'').padEnd(8)} · ${String(m.sender_type||'').padEnd(8)} · ${(m.content||'').slice(0,50).replace(/\n/g,' ')}`)
  }
}
