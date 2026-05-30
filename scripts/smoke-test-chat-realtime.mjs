// Smoke test do Chat Interno em Realtime:
// - Cria 2 usuários temporários numa clínica de teste
// - Abre um chat 1:1 entre eles (via DB direto, sem precisar de cookies)
// - Usuário A se inscreve no canal Realtime
// - Usuário B insere uma mensagem
// - Confirma que A recebeu o broadcast em <2s
//
// Rodar: node scripts/smoke-test-chat-realtime.mjs
//
// IMPORTANTE: usa SERVICE_ROLE_KEY direto para criar usuários — só roda local.

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

function log(...args) { console.log(`[${new Date().toISOString().slice(11,19)}]`, ...args) }

async function main() {
  // 1) Procura uma clínica com pelo menos 2 perfis (precisamos de IDs reais
  //    que existam em auth.users — profiles.id tem FK para lá)
  const { data: cands } = await admin
    .from('profiles')
    .select('id, clinic_id, full_name')
    .not('clinic_id', 'is', null)
    .limit(500)
  if (!cands?.length) { console.error('Sem profiles — abortando.'); process.exit(1) }

  const byClinic = new Map()
  for (const p of cands) {
    const arr = byClinic.get(p.clinic_id) ?? []
    arr.push(p)
    byClinic.set(p.clinic_id, arr)
  }
  let clinicId = null, alice = null, bob = null
  for (const [cid, arr] of byClinic) {
    if (arr.length >= 2) { clinicId = cid; [alice, bob] = arr; break }
  }
  if (!clinicId) { console.error('Nenhuma clínica com 2+ profiles — abortando.'); process.exit(1) }
  const aliceId = alice.id, bobId = bob.id
  log('clinic_id =', clinicId)
  log('alice =', aliceId, alice.full_name)
  log('bob   =', bobId,   bob.full_name)

  // 3) Cria chat direct + participants
  const { data: chat, error: chatErr } = await admin
    .from('chats')
    .insert({ clinic_id: clinicId, kind: 'direct', created_by: aliceId })
    .select('id').single()
  if (chatErr) throw chatErr
  const chatId = chat.id
  log('chat_id =', chatId)

  await admin.from('chat_participants').insert([
    { chat_id: chatId, clinic_id: clinicId, user_id: aliceId, role: 'owner'  },
    { chat_id: chatId, clinic_id: clinicId, user_id: bobId,   role: 'member' },
  ])

  // 4) Alice se inscreve no canal Realtime
  let received = null
  const channel = admin
    .channel(`smoke:${chatId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${chatId}` },
      (payload) => { received = payload.new; log('Alice recebeu broadcast:', payload.new.body) })

  await new Promise((resolve) => channel.subscribe((status) => {
    log('channel status =', status)
    if (status === 'SUBSCRIBED') resolve()
  }))

  // 5) Bob insere mensagem
  await new Promise(r => setTimeout(r, 500))
  const t0 = Date.now()
  await admin.from('chat_messages').insert({
    chat_id: chatId, clinic_id: clinicId, sent_by: bobId, kind: 'text', body: 'Olá Alice, é o Bob.',
  })
  log('Bob inseriu mensagem')

  // 6) Aguarda broadcast (até 5s)
  while (!received && Date.now() - t0 < 5000) {
    await new Promise(r => setTimeout(r, 100))
  }
  const elapsed = Date.now() - t0
  await admin.removeChannel(channel)

  if (!received) {
    console.error('❌ Broadcast NÃO recebido em 5s — Realtime pode estar desabilitado para chat_messages')
  } else {
    log(`✅ Realtime OK — broadcast recebido em ${elapsed}ms`)
  }

  // 7) Limpa só o chat — profiles são reais, não apaga
  await admin.from('chats').delete().eq('id', chatId)
  log('limpeza ok (chat removido; profiles preservados)')

  process.exit(received ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
