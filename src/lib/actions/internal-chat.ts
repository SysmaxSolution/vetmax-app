'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChatKind = 'direct' | 'group' | 'consultation' | 'hospitalization' | 'surgery' | 'channel'
export type ChatEntityType = 'consultation' | 'hospitalization' | 'surgery'

export interface ChatSummary {
  id:              string
  title:           string | null
  display_title:   string | null   // título enriquecido com nome do pet (E3-S2)
  kind:            ChatKind
  entity_type:     ChatEntityType | null
  entity_id:       string | null
  last_message_at: string
  last_preview:    string | null
  unread_count:    number
  force_unread:    boolean         // marcar como não-lida manualmente (E5-S2)
  pinned_at:       string | null   // pin de conversas (E5-S3)
  pin_order:       number | null
  participants:    Array<{ user_id: string; full_name: string | null; role: string }>
}

export interface ChatMessage {
  id:         string
  chat_id:    string
  sent_by:    string | null
  sender_name: string | null
  kind:       'text' | 'system' | 'attachment'
  body:       string | null
  metadata:   Record<string, unknown>
  created_at: string
  edited_at:  string | null
  attachments: Array<{
    id:           string
    title:        string
    file_url:     string | null
    storage_path: string | null
    kind:         'pdf' | 'image' | 'file'
    mime_type:    string | null
    source_entity: string | null
    source_id:    string | null
  }>
}

export interface ChatUserOption {
  user_id:   string
  full_name: string | null
  role:      string
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

type Ctx =
  | { user_id: string; clinic_id: string; full_name: string | null }
  | { error: string }

async function getCtx(): Promise<Ctx> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, full_name').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  return { user_id: user.id, clinic_id: profile.clinic_id as string, full_name: profile.full_name as string | null }
}

// ─── Listagem de chats ────────────────────────────────────────────────────────

/**
 * Lista todos os chats em que o usuário atual participa, ordenados pelo último
 * timestamp de mensagem. Inclui contagem de não lidas (mensagens com
 * created_at > last_read_at) e snippet da última mensagem.
 */
export async function listMyChats(): Promise<ChatSummary[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // 1) chats em que participo (não arquivados)
  const { data: myParts, error: e1 } = await admin
    .from('chat_participants')
    .select('chat_id, last_read_at, force_unread, pinned_at, pin_order')
    .eq('user_id', ctx.user_id)
    .eq('clinic_id', ctx.clinic_id)
    .is('left_at', null)
  if (e1) return { error: e1.message }

  const chatIds = (myParts ?? []).map(p => p.chat_id as string)
  if (chatIds.length === 0) return []

  const lastReadByChat = new Map(
    (myParts ?? []).map(p => [p.chat_id as string, p.last_read_at as string])
  )
  const forceUnreadByChat = new Map(
    (myParts ?? []).map(p => [p.chat_id as string, !!(p as any).force_unread])
  )
  const pinnedByChat = new Map(
    (myParts ?? []).map(p => [p.chat_id as string, { pinned_at: (p as any).pinned_at as string | null, pin_order: (p as any).pin_order as number | null }])
  )

  // 2) chats em si + join com entidades para título enriquecido
  const { data: chats, error: e2 } = await admin
    .from('chats')
    .select('id, title, kind, entity_type, entity_id, last_message_at, archived_at')
    .in('id', chatIds)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false })
    .limit(200)
  if (e2) return { error: e2.message }

  // 2b) Títulos enriquecidos para salas automáticas (E3-S2)
  const entityIds = (chats ?? [])
    .filter((c: any) => c.entity_id && c.entity_type)
    .map((c: any) => c.entity_id as string)

  const displayTitleMap = new Map<string, string>()
  if (entityIds.length > 0) {
    const [consRes, hospRes, surgRes] = await Promise.all([
      admin.from('consultations')
        .select('id, patients(name, species)')
        .in('id', entityIds),
      admin.from('hospitalizations')
        .select('id, patients(name)')
        .in('id', entityIds),
      admin.from('surgeries')
        .select('id, procedure_name, patients(name)')
        .in('id', entityIds),
    ])
    for (const c of (consRes.data ?? []) as any[]) {
      displayTitleMap.set(c.id, `Atendimento · ${c.patients?.name ?? ''}`)
    }
    for (const h of (hospRes.data ?? []) as any[]) {
      displayTitleMap.set(h.id, `Internação · ${h.patients?.name ?? ''}`)
    }
    for (const s of (surgRes.data ?? []) as any[]) {
      const petName = s.patients?.name ?? ''
      const proc    = s.procedure_name ? ` — ${s.procedure_name}` : ''
      displayTitleMap.set(s.id, `Cirurgia · ${petName}${proc}`)
    }
  }

  // 3) participantes (para nome em DM)
  const { data: parts } = await admin
    .from('chat_participants')
    .select('chat_id, user_id, role, profiles(full_name)')
    .in('chat_id', chatIds)
    .is('left_at', null)

  const partsByChat = new Map<string, Array<{ user_id: string; full_name: string | null; role: string }>>()
  for (const p of (parts ?? []) as any[]) {
    const arr = partsByChat.get(p.chat_id) ?? []
    arr.push({ user_id: p.user_id, full_name: p.profiles?.full_name ?? null, role: p.role })
    partsByChat.set(p.chat_id, arr)
  }

  // 4) última mensagem por chat (snippet)
  const { data: lastMsgs } = await admin
    .from('chat_messages')
    .select('chat_id, body, kind, created_at')
    .in('chat_id', chatIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(chatIds.length * 5)

  const previewByChat = new Map<string, string>()
  for (const m of (lastMsgs ?? []) as any[]) {
    if (previewByChat.has(m.chat_id)) continue
    previewByChat.set(m.chat_id, m.kind === 'attachment' ? '📎 Anexo' : (m.body ?? ''))
  }

  // 5) contagem de não-lidas via RPC agregada (E2-S1 — substitui N+1)
  const { data: unreadData } = await admin
    .rpc('fn_chat_unread_count', { p_user_id: ctx.user_id, p_clinic_id: ctx.clinic_id })
  const totalChatUnread = (unreadData as number) ?? 0

  // Contagem por chat ainda necessária para o badge individual na sidebar
  // (a RPC retorna total; aqui fazemos em paralelo mas com Promise.all otimizado)
  const unreadResults = await Promise.all(chatIds.map(async (id) => {
    const since = lastReadByChat.get(id) ?? new Date(0).toISOString()
    const { count } = await admin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', id)
      .gt('created_at', since)
      .neq('sent_by', ctx.user_id)
      .is('deleted_at', null)
    return [id, count ?? 0] as const
  }))
  const unreadByChat = new Map(unreadResults)
  void totalChatUnread  // usado em getNotificationCounts via RPC

  return (chats ?? []).map((c: any): ChatSummary => {
    const pin = pinnedByChat.get(c.id)
    return {
      id:              c.id,
      title:           c.title,
      display_title:   c.entity_id ? (displayTitleMap.get(c.entity_id) ?? c.title) : null,
      kind:            c.kind,
      entity_type:     c.entity_type,
      entity_id:       c.entity_id,
      last_message_at: c.last_message_at,
      last_preview:    previewByChat.get(c.id) ?? null,
      unread_count:    unreadByChat.get(c.id) ?? 0,
      force_unread:    forceUnreadByChat.get(c.id) ?? false,
      pinned_at:       pin?.pinned_at ?? null,
      pin_order:       pin?.pin_order ?? null,
      participants:    partsByChat.get(c.id) ?? [],
    }
  })
}

// ─── Mensagens ────────────────────────────────────────────────────────────────

export async function listChatMessages(
  chatId: string,
  opts?: { limit?: number; before?: string }
): Promise<ChatMessage[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // Confirma participação (RLS no cliente já bloquearia, mas usamos admin)
  const { data: part } = await admin
    .from('chat_participants')
    .select('id')
    .eq('chat_id', chatId)
    .eq('user_id', ctx.user_id)
    .is('left_at', null)
    .maybeSingle()
  if (!part) return { error: 'Sem acesso a este chat.' }

  const limit = Math.min(opts?.limit ?? 100, 200)
  let q = admin
    .from('chat_messages')
    .select('id, chat_id, sent_by, kind, body, metadata, created_at, edited_at, profiles!chat_messages_sent_by_fkey(full_name)')
    .eq('chat_id', chatId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (opts?.before) q = q.lt('created_at', opts.before)

  const { data: msgs, error } = await q
  if (error) return { error: error.message }

  const msgIds = (msgs ?? []).map(m => m.id as string)
  const { data: atts } = msgIds.length > 0
    ? await admin
        .from('chat_attachments')
        .select('id, message_id, title, file_url, storage_path, kind, mime_type, source_entity, source_id')
        .in('message_id', msgIds)
    : { data: [] as any[] }

  const attsByMsg = new Map<string, ChatMessage['attachments']>()
  for (const a of (atts ?? []) as any[]) {
    const arr = attsByMsg.get(a.message_id) ?? []
    arr.push({
      id:            a.id,
      title:         a.title,
      file_url:      a.file_url,
      storage_path:  a.storage_path,
      kind:          a.kind,
      mime_type:     a.mime_type,
      source_entity: a.source_entity,
      source_id:     a.source_id,
    })
    attsByMsg.set(a.message_id, arr)
  }

  // Reverte para ordem cronológica (mais antigo primeiro) e desserializa
  return (msgs ?? [])
    .reverse()
    .map((m: any): ChatMessage => ({
      id:          m.id,
      chat_id:     m.chat_id,
      sent_by:     m.sent_by,
      sender_name: m.profiles?.full_name ?? null,
      kind:        m.kind,
      body:        m.body,
      metadata:    (m.metadata ?? {}) as Record<string, unknown>,
      created_at:  m.created_at,
      edited_at:   m.edited_at,
      attachments: attsByMsg.get(m.id) ?? [],
    }))
}

export async function sendChatMessage(input: {
  chat_id: string
  body:    string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const body = (input.body ?? '').trim()
  if (!body) return { error: 'Mensagem vazia.' }
  if (body.length > 4000) return { error: 'Mensagem muito longa (limite 4000 chars).' }

  const admin = createAdminClient()
  const { data: part } = await admin
    .from('chat_participants')
    .select('id')
    .eq('chat_id', input.chat_id)
    .eq('user_id', ctx.user_id)
    .is('left_at', null)
    .maybeSingle()
  if (!part) return { error: 'Sem acesso a este chat.' }

  const { data, error } = await admin
    .from('chat_messages')
    .insert({
      chat_id:   input.chat_id,
      clinic_id: ctx.clinic_id,
      sent_by:   ctx.user_id,
      kind:      'text',
      body,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  return { id: data.id as string }
}

export async function markChatRead(chatId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { error } = await admin
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString(), force_unread: false })
    .eq('chat_id', chatId)
    .eq('user_id', ctx.user_id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function markAllChatsRead(): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { error } = await admin
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('user_id', ctx.user_id)
    .eq('clinic_id', ctx.clinic_id)
    .is('left_at', null)
  if (error) return { error: error.message }
  return { success: true }
}

// ─── Iniciar chat ─────────────────────────────────────────────────────────────

export async function searchUsersForChat(query: string): Promise<ChatUserOption[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const q = (query ?? '').trim()
  const admin = createAdminClient()
  let qb = admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('clinic_id', ctx.clinic_id)
    .neq('id', ctx.user_id)
    .order('full_name', { ascending: true })
    .limit(15)
  if (q.length >= 2) qb = qb.ilike('full_name', `%${q}%`)

  const { data, error } = await qb
  if (error) return { error: error.message }
  return (data ?? []).map((p: any): ChatUserOption => ({
    user_id:   p.id,
    full_name: p.full_name,
    role:      p.role,
  }))
}

/**
 * Cria (ou recupera) um chat 1:1 com outro usuário da mesma clínica. Não
 * confiamos só em UNIQUE — para "direct" o entity_id é NULL, então fazemos
 * lookup explícito pelos participantes antes de criar.
 */
export async function openOrCreateDirectChat(
  otherUserId: string,
): Promise<{ chat_id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (otherUserId === ctx.user_id) return { error: 'Não é possível abrir chat consigo mesmo.' }

  const admin = createAdminClient()

  // Confirma o outro usuário existe na mesma clínica
  const { data: otherProfile } = await admin
    .from('profiles').select('id, clinic_id').eq('id', otherUserId).single()
  if (!otherProfile || otherProfile.clinic_id !== ctx.clinic_id) {
    return { error: 'Usuário não encontrado na clínica.' }
  }

  // Busca chat direct que contenha exatamente os dois
  const { data: myChats } = await admin
    .from('chat_participants')
    .select('chat_id, chats!inner(kind, entity_id)')
    .eq('user_id', ctx.user_id)
    .is('left_at', null)

  const directIds = (myChats ?? [])
    .filter((r: any) => r.chats?.kind === 'direct' && r.chats?.entity_id === null)
    .map((r: any) => r.chat_id as string)

  if (directIds.length > 0) {
    const { data: hits } = await admin
      .from('chat_participants')
      .select('chat_id')
      .in('chat_id', directIds)
      .eq('user_id', otherUserId)
      .is('left_at', null)
    if (hits && hits.length > 0) {
      return { chat_id: hits[0].chat_id as string }
    }
  }

  // Cria novo chat direct + participantes
  const { data: chat, error: chatErr } = await admin
    .from('chats')
    .insert({
      clinic_id: ctx.clinic_id,
      kind:      'direct',
      created_by: ctx.user_id,
    })
    .select('id')
    .single()
  if (chatErr || !chat) return { error: chatErr?.message ?? 'Falha ao criar chat.' }

  const chatId = chat.id as string
  const { error: pErr } = await admin.from('chat_participants').insert([
    { chat_id: chatId, clinic_id: ctx.clinic_id, user_id: ctx.user_id,   role: 'owner'  },
    { chat_id: chatId, clinic_id: ctx.clinic_id, user_id: otherUserId,   role: 'member' },
  ])
  if (pErr) return { error: pErr.message }

  revalidatePath('/dashboard/internal-chat')
  return { chat_id: chatId }
}

/**
 * Cria uma sala de grupo (kind='group') com título e N participantes além
 * do criador (que vira owner). Validações: título obrigatório, ao menos 1
 * participante adicional, máximo 50 membros (limite arbitrário para evitar
 * "broadcast lists").
 */
export async function createGroupChat(input: {
  title:       string
  member_ids:  string[]
}): Promise<{ chat_id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const title = (input.title ?? '').trim()
  if (!title)            return { error: 'Título obrigatório.' }
  if (title.length > 80) return { error: 'Título muito longo (máx 80).' }

  const members = (input.member_ids ?? []).filter(id => id && id !== ctx.user_id)
  const unique  = Array.from(new Set(members))
  if (unique.length === 0)  return { error: 'Selecione ao menos um participante.' }
  if (unique.length > 50)   return { error: 'Limite de 50 participantes por grupo.' }

  const admin = createAdminClient()

  // Confirma que todos os ids pertencem à mesma clínica
  const { data: validProfiles } = await admin
    .from('profiles').select('id, clinic_id').in('id', unique)
  const validIds = (validProfiles ?? [])
    .filter(p => p.clinic_id === ctx.clinic_id)
    .map(p => p.id as string)
  if (validIds.length !== unique.length) {
    return { error: 'Algum participante não pertence à clínica.' }
  }

  const { data: chat, error } = await admin
    .from('chats')
    .insert({
      clinic_id:  ctx.clinic_id,
      kind:       'group',
      title,
      created_by: ctx.user_id,
    })
    .select('id')
    .single()
  if (error || !chat) return { error: error?.message ?? 'Falha ao criar grupo.' }

  const chatId = chat.id as string
  const rows = [
    { chat_id: chatId, clinic_id: ctx.clinic_id, user_id: ctx.user_id, role: 'owner' },
    ...validIds.map(uid => ({
      chat_id: chatId, clinic_id: ctx.clinic_id, user_id: uid, role: 'member',
    })),
  ]
  const { error: pErr } = await admin.from('chat_participants').insert(rows)
  if (pErr) return { error: pErr.message }

  // Mensagem system inicial
  await admin.from('chat_messages').insert({
    chat_id:   chatId,
    clinic_id: ctx.clinic_id,
    sent_by:   ctx.user_id,
    kind:      'system',
    body:      `Grupo "${title}" criado por ${ctx.full_name ?? 'usuário'}.`,
    metadata:  { event: 'group_created' },
  })

  revalidatePath('/dashboard/internal-chat')
  return { chat_id: chatId }
}

// ─── Anexos automáticos: PDFs gerados (receitas, termos, exames) ────────────

/**
 * Anexa um PDF/arquivo gerado em outro fluxo (receituário, termo de consentimento,
 * laudo de exame) à sala de chat da entidade clínica correspondente. Fire-and-
 * forget — se falhar, apenas loga e segue. O caller (gerador do PDF) NÃO deve
 * abortar por causa disso. Usa o admin client para bypassar RLS porque o usuário
 * que gera o PDF pode não ser participante explícito da sala ainda.
 */
// Versão interna sem validação de sessão — para callers server-side (document-generation.ts)
export async function _attachDocumentToEntityChatInternal(input: {
  clinic_id:     string
  user_id?:      string | null
  entity_type:   ChatEntityType
  entity_id:     string
  title:         string
  file_url:      string
  storage_path?: string | null
  mime_type?:    string | null
  byte_size?:    number | null
  source_entity: 'prescription' | 'term' | 'exam' | 'laudo' | 'receipt' | 'other'
  source_id?:    string | null
  body?:         string | null
}): Promise<{ message_id: string; chat_id: string } | { error: string }> {
  if (!input.clinic_id || !input.entity_id || !input.title || !input.file_url) {
    return { error: 'Parâmetros incompletos.' }
  }
  const admin = createAdminClient()

  let { data: chat } = await admin
    .from('chats')
    .select('id')
    .eq('clinic_id', input.clinic_id)
    .eq('entity_type', input.entity_type)
    .eq('entity_id', input.entity_id)
    .maybeSingle()

  if (!chat) {
    const { data: created, error: createErr } = await admin
      .from('chats')
      .insert({ clinic_id: input.clinic_id, kind: input.entity_type, entity_type: input.entity_type, entity_id: input.entity_id, created_by: input.user_id ?? null })
      .select('id').single()
    if (createErr) return { error: 'Falha ao abrir sala: ' + createErr.message }
    chat = created
  }

  const chatId = chat!.id as string
  const { data: msg, error: msgErr } = await admin
    .from('chat_messages')
    .insert({ chat_id: chatId, clinic_id: input.clinic_id, sent_by: input.user_id ?? null, kind: 'attachment', body: input.body ?? `📎 ${input.title}`, metadata: { source_entity: input.source_entity, source_id: input.source_id ?? null } })
    .select('id').single()
  if (msgErr || !msg) return { error: 'Falha ao registrar mensagem: ' + (msgErr?.message ?? '') }

  const inferredKind: 'pdf' | 'image' | 'file' =
    input.mime_type?.startsWith('image/') ? 'image'
    : (input.mime_type === 'application/pdf' || input.title.toLowerCase().endsWith('.pdf')) ? 'pdf'
    : 'file'

  const { error: attErr } = await admin.from('chat_attachments').insert({
    message_id: msg.id, chat_id: chatId, clinic_id: input.clinic_id, kind: inferredKind,
    title: input.title, file_url: input.file_url, storage_path: input.storage_path ?? null,
    mime_type: input.mime_type ?? null, byte_size: input.byte_size ?? null,
    source_entity: input.source_entity, source_id: input.source_id ?? null,
  })
  if (attErr) return { error: 'Falha ao anexar: ' + attErr.message }

  return { message_id: msg.id as string, chat_id: chatId }
}

// Versão pública com validação de tenant — E1-S2
export async function attachDocumentToEntityChat(input: {
  clinic_id:     string
  user_id?:      string | null
  entity_type:   ChatEntityType
  entity_id:     string
  title:         string
  file_url:      string
  storage_path?: string | null
  mime_type?:    string | null
  byte_size?:    number | null
  source_entity: 'prescription' | 'term' | 'exam' | 'laudo' | 'receipt' | 'other'
  source_id?:    string | null
  body?:         string | null
}): Promise<{ message_id: string; chat_id: string } | { error: string }> {
  const ctx = await getCtx()
  if (!('error' in ctx) && ctx.clinic_id !== input.clinic_id) {
    console.warn(`[attachDocumentToEntityChat] cross-tenant: sessão=${ctx.clinic_id} input=${input.clinic_id}`)
    return { error: 'Clínica não autorizada.' }
  }
  return _attachDocumentToEntityChatInternal(input)
}

// ─── Upload manual de anexo (UI) ─────────────────────────────────────────────

const CHAT_ATT_BUCKET = 'chat-attachments'
const MAX_BYTES = 25 * 1024 * 1024  // 25MB

/**
 * Upload de um arquivo ao Chat Interno. Aceita FormData de um <form> com
 * campos: chat_id (text) e file (File). Aceita QUALQUER mime; valida tamanho
 * (25MB). Cria a chat_message portadora + chat_attachment com signed URL.
 *
 * O bucket é privado: o file_url salvo é uma signed URL de 7 dias. Para chats
 * que exigem persistência longa, refresh sob demanda pode ser feito depois.
 */
export async function uploadChatAttachment(
  formData: FormData,
): Promise<{ message_id: string; chat_id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const chatId = (formData.get('chat_id') as string | null)?.trim() ?? ''
  const file   = formData.get('file') as File | null

  if (!chatId) return { error: 'chat_id obrigatório.' }
  if (!file)   return { error: 'Arquivo obrigatório.' }
  if (file.size === 0) return { error: 'Arquivo vazio.' }
  if (file.size > MAX_BYTES) return { error: `Arquivo maior que ${Math.round(MAX_BYTES / 1024 / 1024)}MB.` }

  const admin = createAdminClient()

  // Confirma participação no chat
  const { data: part } = await admin
    .from('chat_participants')
    .select('id')
    .eq('chat_id', chatId)
    .eq('user_id', ctx.user_id)
    .is('left_at', null)
    .maybeSingle()
  if (!part) return { error: 'Sem acesso a este chat.' }

  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  const objectId = crypto.randomUUID()
  const path = `${ctx.clinic_id}/${chatId}/${objectId}.${ext}`

  const arrayBuf = await file.arrayBuffer()
  const { error: upErr } = await admin.storage
    .from(CHAT_ATT_BUCKET)
    .upload(path, new Uint8Array(arrayBuf), {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (upErr) return { error: 'Falha no upload: ' + upErr.message }

  // Signed URL longa (7 dias). Refresh pode ser adicionado depois.
  const { data: signed, error: signErr } = await admin.storage
    .from(CHAT_ATT_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7)
  if (signErr || !signed) {
    await admin.storage.from(CHAT_ATT_BUCKET).remove([path])
    return { error: 'Falha ao gerar URL: ' + (signErr?.message ?? '') }
  }

  // chat_messages: portadora do anexo
  const { data: msg, error: msgErr } = await admin
    .from('chat_messages')
    .insert({
      chat_id:   chatId,
      clinic_id: ctx.clinic_id,
      sent_by:   ctx.user_id,
      kind:      'attachment',
      body:      `📎 ${file.name}`,
      metadata:  { uploader: ctx.user_id, original_name: file.name },
    })
    .select('id')
    .single()
  if (msgErr || !msg) {
    await admin.storage.from(CHAT_ATT_BUCKET).remove([path])
    return { error: 'Falha ao registrar mensagem: ' + (msgErr?.message ?? '') }
  }

  const inferredKind: 'pdf' | 'image' | 'file' =
       file.type.startsWith('image/')   ? 'image'
     : file.type === 'application/pdf'  ? 'pdf'
     : ext === 'pdf'                    ? 'pdf'
     : 'file'

  const { error: attErr } = await admin
    .from('chat_attachments')
    .insert({
      message_id:   msg.id,
      chat_id:      chatId,
      clinic_id:    ctx.clinic_id,
      kind:         inferredKind,
      title:        file.name,
      file_url:     signed.signedUrl,
      storage_path: path,
      mime_type:    file.type || null,
      byte_size:    file.size,
      source_entity: 'other',
    })
  if (attErr) return { error: 'Falha ao anexar: ' + attErr.message }

  return { message_id: msg.id as string, chat_id: chatId }
}

// ─── Notificações consolidadas (sininho) ──────────────────────────────────────

export interface NotificationCounts {
  whatsapp_unread:    number
  chat_unread:        number
  hospitalization_alerts: number
  total:              number
}

export async function getNotificationCounts(): Promise<NotificationCounts | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // WhatsApp: conversas com mensagens não lidas
  const wppQ = admin
    .from('whatsapp_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', ctx.clinic_id)
    .gt('unread_count', 0)

  // Internação: tarefas atrasadas — best-effort. Se a tabela não existir, conta 0.
  const hospQ = admin
    .from('hospitalization_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', ctx.clinic_id)
    .eq('status', 'pending')
    .lt('scheduled_at', new Date().toISOString())

  // Chat: RPC única em vez de N+1 por chat (E2-S1)
  const chatRpcQ = admin.rpc('fn_chat_unread_count', {
    p_user_id:   ctx.user_id,
    p_clinic_id: ctx.clinic_id,
  })

  const [wppRes, hospRes, chatRpcRes] = await Promise.all([wppQ, hospQ, chatRpcQ])

  const chatUnread = (chatRpcRes.data as number) ?? 0
  const wpp  = wppRes.count ?? 0
  const hosp = hospRes.error ? 0 : (hospRes.count ?? 0)

  return {
    whatsapp_unread:        wpp,
    chat_unread:            chatUnread,
    hospitalization_alerts: hosp,
    total:                  wpp + chatUnread + hosp,
  }
}

// ─── Marcar como não-lida manualmente (E5-S2) ────────────────────────────────

export async function markChatUnread(chatId: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { error } = await admin
    .from('chat_participants')
    .update({ force_unread: true })
    .eq('chat_id', chatId)
    .eq('user_id', ctx.user_id)
  if (error) return { error: error.message }
  return { success: true }
}

// ─── Fixar / desafixar conversa (E5-S3) ──────────────────────────────────────

export async function toggleChatPin(
  chatId: string,
): Promise<{ pinned: boolean } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: part } = await admin
    .from('chat_participants')
    .select('pinned_at, pin_order')
    .eq('chat_id', chatId)
    .eq('user_id', ctx.user_id)
    .maybeSingle()
  if (!part) return { error: 'Sem acesso a este chat.' }

  const isPinned = !!(part as any).pinned_at
  const { error } = await admin
    .from('chat_participants')
    .update(isPinned
      ? { pinned_at: null, pin_order: null }
      : { pinned_at: new Date().toISOString(), pin_order: 0 })
    .eq('chat_id', chatId)
    .eq('user_id', ctx.user_id)
  if (error) return { error: error.message }
  return { pinned: !isPinned }
}

export async function reorderPinnedChats(
  orderedChatIds: string[],
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const updates = orderedChatIds.map((chatId, index) =>
    admin
      .from('chat_participants')
      .update({ pin_order: index })
      .eq('chat_id', chatId)
      .eq('user_id', ctx.user_id)
  )
  const results = await Promise.all(updates)
  const failed = results.find(r => r.error)
  if (failed?.error) return { error: failed.error.message }
  return { success: true }
}

// ─── Gerenciar participantes pós-criação (E5-S1) ─────────────────────────────

export async function addParticipantToChat(
  chatId: string,
  userId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // Apenas owner pode adicionar
  const { data: myPart } = await admin
    .from('chat_participants')
    .select('role')
    .eq('chat_id', chatId)
    .eq('user_id', ctx.user_id)
    .is('left_at', null)
    .maybeSingle()
  if (!myPart || (myPart as any).role !== 'owner') {
    return { error: 'Apenas o administrador do grupo pode adicionar participantes.' }
  }

  // Confirma que o novo usuário é da mesma clínica
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', userId).single()
  if (!profile || profile.clinic_id !== ctx.clinic_id) {
    return { error: 'Usuário não encontrado na clínica.' }
  }

  const { data: chat } = await admin
    .from('chats').select('clinic_id').eq('id', chatId).single()
  if (!chat || (chat as any).clinic_id !== ctx.clinic_id) {
    return { error: 'Chat não encontrado.' }
  }

  const { error } = await admin
    .from('chat_participants')
    .upsert({ chat_id: chatId, clinic_id: ctx.clinic_id, user_id: userId, role: 'member', left_at: null },
             { onConflict: 'chat_id,user_id', ignoreDuplicates: false })
  if (error) return { error: error.message }

  await admin.from('chat_messages').insert({
    chat_id:   chatId,
    clinic_id: ctx.clinic_id,
    sent_by:   ctx.user_id,
    kind:      'system',
    body:      `${ctx.full_name ?? 'Usuário'} adicionou um participante.`,
    metadata:  { event: 'participant_added', target_user: userId },
  })

  return { success: true }
}

export async function removeParticipantFromChat(
  chatId: string,
  userId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  const { data: myPart } = await admin
    .from('chat_participants')
    .select('role')
    .eq('chat_id', chatId)
    .eq('user_id', ctx.user_id)
    .is('left_at', null)
    .maybeSingle()

  // Pode remover: owner remove qualquer um; membro pode sair de si mesmo
  const isSelf = userId === ctx.user_id
  if (!myPart) return { error: 'Sem acesso a este chat.' }
  if (!isSelf && (myPart as any).role !== 'owner') {
    return { error: 'Apenas o administrador pode remover outros participantes.' }
  }

  const { error } = await admin
    .from('chat_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', userId)
  if (error) return { error: error.message }

  await admin.from('chat_messages').insert({
    chat_id:   chatId,
    clinic_id: ctx.clinic_id,
    sent_by:   ctx.user_id,
    kind:      'system',
    body:      isSelf ? `${ctx.full_name ?? 'Usuário'} saiu do grupo.` : `Um participante foi removido.`,
    metadata:  { event: isSelf ? 'participant_left' : 'participant_removed', target_user: userId },
  })

  return { success: true }
}

// ─── Editar / deletar mensagem (E3-S3) ────────────────────────────────────────

export async function editChatMessage(
  messageId: string,
  body: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const trimmed = body.trim()
  if (!trimmed) return { error: 'Corpo vazio.' }
  if (trimmed.length > 4000) return { error: 'Mensagem muito longa.' }

  const admin = createAdminClient()
  const { data: msg } = await admin
    .from('chat_messages')
    .select('sent_by, clinic_id, kind')
    .eq('id', messageId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!msg) return { error: 'Mensagem não encontrada.' }
  if ((msg as any).sent_by !== ctx.user_id) return { error: 'Sem permissão para editar esta mensagem.' }
  if ((msg as any).kind !== 'text') return { error: 'Somente mensagens de texto podem ser editadas.' }
  if ((msg as any).clinic_id !== ctx.clinic_id) return { error: 'Acesso negado.' }

  const { error } = await admin
    .from('chat_messages')
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq('id', messageId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteChatMessage(
  messageId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: msg } = await admin
    .from('chat_messages')
    .select('sent_by, clinic_id, chat_id')
    .eq('id', messageId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!msg) return { error: 'Mensagem não encontrada.' }
  if ((msg as any).clinic_id !== ctx.clinic_id) return { error: 'Acesso negado.' }

  const isSender = (msg as any).sent_by === ctx.user_id
  if (!isSender) {
    // verifica se é owner do chat
    const { data: part } = await admin
      .from('chat_participants')
      .select('role')
      .eq('chat_id', (msg as any).chat_id)
      .eq('user_id', ctx.user_id)
      .is('left_at', null)
      .maybeSingle()
    if (!part || (part as any).role !== 'owner') {
      return { error: 'Sem permissão para deletar esta mensagem.' }
    }
  }

  const { error } = await admin
    .from('chat_messages')
    .update({ deleted_at: new Date().toISOString(), body: null })
    .eq('id', messageId)
  if (error) return { error: error.message }
  return { success: true }
}

// ─── Renovar URL de anexo expirada (E5-S4) ───────────────────────────────────

const CHAT_ATT_BUCKET_CONST = 'chat-attachments'

export async function renewAttachmentUrl(
  attachmentId: string,
): Promise<{ file_url: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: att } = await admin
    .from('chat_attachments')
    .select('id, clinic_id, storage_path, chat_id')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!att) return { error: 'Anexo não encontrado.' }
  if ((att as any).clinic_id !== ctx.clinic_id) return { error: 'Acesso negado.' }
  if (!(att as any).storage_path) return { error: 'Sem storage_path para renovar.' }

  const { data: signed, error: signErr } = await admin.storage
    .from(CHAT_ATT_BUCKET_CONST)
    .createSignedUrl((att as any).storage_path, 60 * 60 * 24 * 7)
  if (signErr || !signed) return { error: 'Falha ao gerar nova URL.' }

  await admin
    .from('chat_attachments')
    .update({ file_url: signed.signedUrl, url_expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString() })
    .eq('id', attachmentId)

  return { file_url: signed.signedUrl }
}

// ─── Chat de entidade por referência (E3-S1) ──────────────────────────────────

export async function getEntityChatId(
  entity_type: ChatEntityType,
  entity_id:   string,
): Promise<{ chat_id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: chat } = await admin
    .from('chats')
    .select('id')
    .eq('clinic_id', ctx.clinic_id)
    .eq('entity_type', entity_type)
    .eq('entity_id', entity_id)
    .maybeSingle()
  if (!chat) return { error: 'Sala não encontrada para esta entidade.' }
  return { chat_id: (chat as any).id as string }
}

// ─── Canais de módulo (E4-S2) ─────────────────────────────────────────────────

export interface ChannelSummary {
  id:          string
  title:       string | null
  slug:        string | null
  is_public:   boolean
  participant: boolean
  last_message_at: string | null
}

export async function listChannels(): Promise<ChannelSummary[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: chats, error } = await admin
    .from('chats')
    .select('id, title, slug, is_public, last_message_at')
    .eq('clinic_id', ctx.clinic_id)
    .eq('kind', 'channel')
    .is('archived_at', null)
    .order('title', { ascending: true })
  if (error) return { error: error.message }

  const chatIds = (chats ?? []).map((c: any) => c.id as string)
  let myIds = new Set<string>()
  if (chatIds.length > 0) {
    const { data: myParts } = await admin
      .from('chat_participants')
      .select('chat_id')
      .in('chat_id', chatIds)
      .eq('user_id', ctx.user_id)
      .is('left_at', null)
    myIds = new Set((myParts ?? []).map((p: any) => p.chat_id as string))
  }

  return (chats ?? []).map((c: any): ChannelSummary => ({
    id:              c.id,
    title:           c.title,
    slug:            c.slug,
    is_public:       !!(c as any).is_public,
    participant:     myIds.has(c.id),
    last_message_at: c.last_message_at,
  }))
}

export async function joinChannel(
  chatId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data: chat } = await admin
    .from('chats')
    .select('kind, is_public, clinic_id')
    .eq('id', chatId)
    .maybeSingle()
  if (!chat) return { error: 'Canal não encontrado.' }
  if ((chat as any).kind !== 'channel') return { error: 'Esta sala não é um canal.' }
  if ((chat as any).clinic_id !== ctx.clinic_id) return { error: 'Acesso negado.' }
  if (!(chat as any).is_public) return { error: 'Canal privado — solicite ao administrador.' }

  const { error } = await admin
    .from('chat_participants')
    .upsert({ chat_id: chatId, clinic_id: ctx.clinic_id, user_id: ctx.user_id, role: 'member', left_at: null },
             { onConflict: 'chat_id,user_id', ignoreDuplicates: false })
  if (error) return { error: error.message }
  return { success: true }
}

export async function createChannelChat(input: {
  title:            string
  slug?:            string | null
  modulo_contexto?: string | null
  is_public?:       boolean
}): Promise<{ chat_id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // Apenas admins podem criar canais
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', ctx.user_id).single()
  if (!profile || !['admin', 'director'].includes((profile as any).role)) {
    return { error: 'Apenas administradores podem criar canais.' }
  }

  const title = (input.title ?? '').trim()
  if (!title) return { error: 'Título obrigatório.' }

  const slug = input.slug
    ? input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40)
    : null

  const { data: chat, error } = await admin
    .from('chats')
    .insert({
      clinic_id:  ctx.clinic_id,
      kind:       'channel',
      title,
      slug:       slug ?? null,
      is_public:  input.is_public ?? true,
      created_by: ctx.user_id,
      metadata:   input.modulo_contexto ? { modulo_contexto: input.modulo_contexto } : {},
    })
    .select('id')
    .single()
  if (error || !chat) return { error: error?.message ?? 'Falha ao criar canal.' }

  const chatId = (chat as any).id as string
  await admin.from('chat_participants').insert({
    chat_id: chatId, clinic_id: ctx.clinic_id, user_id: ctx.user_id, role: 'owner',
  })

  revalidatePath('/dashboard/internal-chat')
  return { chat_id: chatId }
}
