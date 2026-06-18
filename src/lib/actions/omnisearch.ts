'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type OmnisearchGroupKey =
  | 'cadastro'
  | 'consulta'
  | 'internacao'
  | 'exames'
  | 'conversas'
  | 'whatsapp'

export interface OmnisearchHit {
  id:       string
  title:    string
  subtitle: string
  href:     string
  /** Sub-tipo dentro do grupo (ex: 'patient' vs 'tutor' dentro de 'cadastro'). */
  kind:     string
}

export interface OmnisearchGroup {
  key:    OmnisearchGroupKey
  label:  string
  hits:   OmnisearchHit[]
  /** Total real (pode ser maior que hits.length quando trunca em 20). */
  count:  number
}

export interface OmnisearchResult {
  query:  string
  groups: OmnisearchGroup[]
  /** Soma total para o badge na barra ("12 resultados"). */
  total:  number
}

const PER_GROUP_LIMIT = 20

/**
 * Busca universal AGRUPADA. O cliente mostra primeiro os grupos com contagem;
 * ao clicar em um, expande os hits. Todas as queries respeitam multi-tenancy
 * via clinic_id; conversas internas filtram pelos chats em que participo.
 */
export async function omnisearch(query: string): Promise<OmnisearchResult | { error: string }> {
  const q = (query ?? '').trim()
  if (q.length < 2) {
    return { query: q, groups: [], total: 0 }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const clinicId = profile.clinic_id
  const pat      = `%${q}%`
  const digits   = q.replace(/\D/g, '')
  const looksId  = /^[a-f0-9-]{6,}$/i.test(q)

  const [
    pets, tutors, consultsByName, consultsByTutor, consultsById,
    hospsByPet, examsByPet, chats, wppConvs, wppMsgs,
  ] = await Promise.all([
    admin.from('patients')
      .select('id, name, species, breed, tutors(name)')
      .eq('clinic_id', clinicId).is('deleted_at', null).ilike('name', pat)
      .order('name').limit(PER_GROUP_LIMIT),

    admin.from('tutors')
      .select('id, name, phone, cpf')
      .eq('clinic_id', clinicId)
      .or(`name.ilike.${pat}${digits.length >= 6 ? `,phone.ilike.%${digits}%,cpf.ilike.%${digits}%` : ''}`)
      .order('name').limit(PER_GROUP_LIMIT),

    admin.from('consultations')
      .select('id, status, created_at, patients(name), tutors(name)')
      .eq('clinic_id', clinicId)
      .ilike('patients.name', pat)
      .not('patients', 'is', null)
      .order('created_at', { ascending: false }).limit(PER_GROUP_LIMIT),

    admin.from('consultations')
      .select('id, status, created_at, patients(name), tutors(name)')
      .eq('clinic_id', clinicId)
      .ilike('tutors.name', pat)
      .not('tutors', 'is', null)
      .order('created_at', { ascending: false }).limit(PER_GROUP_LIMIT),

    looksId
      ? admin.from('consultations')
          .select('id, status, created_at, patients(name)')
          .eq('clinic_id', clinicId)
          .ilike('id', `${q.toLowerCase()}%`)
          .limit(PER_GROUP_LIMIT)
      : Promise.resolve({ data: [] as any[], error: null }),

    admin.from('hospitalizations')
      .select('id, status, created_at, patients(name)')
      .eq('clinic_id', clinicId)
      .ilike('patients.name', pat)
      .not('patients', 'is', null)
      .order('created_at', { ascending: false }).limit(PER_GROUP_LIMIT),

    admin.from('exam_requests')
      .select('id, status, exam_type, requested_at, patients(name)')
      .eq('clinic_id', clinicId)
      .or(`exam_type.ilike.${pat}`)
      .order('requested_at', { ascending: false }).limit(PER_GROUP_LIMIT),

    admin.from('chat_messages')
      .select('id, chat_id, body, created_at, chat_participants!inner(user_id), chats(title, kind)')
      .eq('clinic_id', clinicId)
      .ilike('body', pat)
      .is('deleted_at', null)
      .eq('chat_participants.user_id', user.id)
      .order('created_at', { ascending: false }).limit(PER_GROUP_LIMIT),

    admin.from('whatsapp_conversations')
      .select('id, tutor_name, tutor_phone, status, last_message_at')
      .eq('clinic_id', clinicId)
      .or(`tutor_name.ilike.${pat}${digits.length >= 6 ? `,tutor_phone.ilike.%${digits}%` : ''}`)
      .order('last_message_at', { ascending: false }).limit(PER_GROUP_LIMIT),

    admin.from('whatsapp_messages')
      .select('id, conversation_id, content, direction, created_at, whatsapp_conversations(tutor_name, tutor_phone)')
      .eq('clinic_id', clinicId)
      .ilike('content', pat)
      .order('created_at', { ascending: false }).limit(PER_GROUP_LIMIT),
  ])

  // ── Cadastro: pets + tutores ───────────────────────────────────────────────
  const cadastro: OmnisearchHit[] = []
  for (const p of (pets.data ?? []) as any[]) {
    cadastro.push({
      kind:     'patient',
      id:       p.id,
      title:    p.name ?? '(sem nome)',
      subtitle: [p.species, p.breed].filter(Boolean).join(' · ')
        + (p.tutors?.name ? ` — Tutor: ${p.tutors.name}` : ''),
      href:     `/dashboard/patients/${p.id}`,
    })
  }
  for (const t of (tutors.data ?? []) as any[]) {
    cadastro.push({
      kind:     'tutor',
      id:       t.id,
      title:    t.name ?? '(sem nome)',
      subtitle: [t.phone, t.cpf].filter(Boolean).join(' · ') || 'Tutor',
      href:     `/dashboard/patients/tutor/${t.id}`,
    })
  }

  // ── Consulta: dedupe (mesma consulta pode bater em ambas as queries) ──────
  const consultMap = new Map<string, OmnisearchHit>()
  for (const c of [
    ...((consultsByName.data ?? []) as any[]),
    ...((consultsByTutor.data ?? []) as any[]),
    ...((consultsById.data   ?? []) as any[]),
  ]) {
    if (consultMap.has(c.id)) continue
    consultMap.set(c.id, {
      kind:     'consultation',
      id:       c.id,
      title:    `Atendimento ${(c.id as string).slice(0, 8)}`,
      subtitle: `${c.patients?.name ?? '—'}${c.tutors?.name ? ` · Tutor: ${c.tutors.name}` : ''} · ${c.status}`,
      href:     `/dashboard/vet/${c.id}`,
    })
  }
  const consulta = [...consultMap.values()]

  // ── Internação ─────────────────────────────────────────────────────────────
  const internacao: OmnisearchHit[] = ((hospsByPet.data ?? []) as any[]).map(h => ({
    kind:     'hospitalization',
    id:       h.id,
    title:    `Internação · ${h.patients?.name ?? '—'}`,
    subtitle: `Status ${h.status} · admissão ${h.created_at ? new Date(h.created_at).toLocaleDateString('pt-BR') : '—'}`,
    href:     `/dashboard/hospitalization?focus=${h.id}`,
  }))

  // ── Exames ─────────────────────────────────────────────────────────────────
  const exames: OmnisearchHit[] = ((examsByPet.data ?? []) as any[]).map(e => ({
    kind:     'exam',
    id:       e.id,
    title:    `${e.exam_type} · ${e.patients?.name ?? '—'}`,
    subtitle: `Status ${e.status} · ${e.requested_at ? new Date(e.requested_at).toLocaleDateString('pt-BR') : '—'}`,
    href:     `/dashboard/exams?focus=${e.id}`,
  }))

  // ── Conversas internas ────────────────────────────────────────────────────
  const conversas: OmnisearchHit[] = ((chats.data ?? []) as any[]).map(m => ({
    kind:     'chat',
    id:       m.id,
    title:    `“${(m.body ?? '').slice(0, 60)}”`,
    subtitle: `${m.chats?.title ?? 'Conversa'} · ${new Date(m.created_at).toLocaleString('pt-BR')}`,
    href:     `/dashboard/internal-chat?chat=${m.chat_id}`,
  }))

  // ── WhatsApp: conversas + mensagens (dedupe por conversation_id) ──────────
  const wppMap = new Map<string, OmnisearchHit>()
  for (const c of (wppConvs.data ?? []) as any[]) {
    wppMap.set(c.id, {
      kind:     'whatsapp_conv',
      id:       c.id,
      title:    c.tutor_name ?? c.tutor_phone ?? 'Conversa WhatsApp',
      subtitle: `${c.tutor_phone ?? ''} · status ${c.status}`,
      href:     `/dashboard/whatsapp?conv=${c.id}`,
    })
  }
  for (const m of (wppMsgs.data ?? []) as any[]) {
    if (wppMap.has(m.conversation_id)) continue
    wppMap.set(m.conversation_id, {
      kind:     'whatsapp_msg',
      id:       m.id,
      title:    `“${(m.content ?? '').slice(0, 60)}”`,
      subtitle: `${m.whatsapp_conversations?.tutor_name ?? m.whatsapp_conversations?.tutor_phone ?? 'Conversa'} · ${m.direction === 'inbound' ? 'recebida' : 'enviada'}`,
      href:     `/dashboard/whatsapp?conv=${m.conversation_id}`,
    })
  }
  const whatsapp = [...wppMap.values()]

  const allGroups: OmnisearchGroup[] = [
    { key: 'cadastro',   label: 'Cadastro (Pets/Tutores)', hits: cadastro,   count: cadastro.length   },
    { key: 'consulta',   label: 'Consultas',                hits: consulta,   count: consulta.length   },
    { key: 'internacao', label: 'Internação',               hits: internacao, count: internacao.length },
    { key: 'exames',     label: 'Exames',                   hits: exames,     count: exames.length     },
    { key: 'conversas',  label: 'Chat Interno',             hits: conversas,  count: conversas.length  },
    { key: 'whatsapp',   label: 'WhatsApp',                 hits: whatsapp,   count: whatsapp.length   },
  ]
  const groups = allGroups.filter(g => g.count > 0)

  const total = groups.reduce((s, g) => s + g.count, 0)

  return { query: q, groups, total }
}
