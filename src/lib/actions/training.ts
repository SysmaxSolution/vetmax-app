'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'training-videos'
const SIGNED_TTL = 60 * 8 // 8 min — curto, renovável

async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return null
  return {
    admin,
    userId: user.id,
    email: user.email ?? '',
    name: (profile.full_name as string) || (user.email ?? 'Usuário'),
    role: (profile.role as string) || 'user',
    clinicId: profile.clinic_id as string,
  }
}

// Conjunto de módulos que o usuário pode treinar. Sem linhas em training_module_access = libera todos.
async function allowedModules(admin: ReturnType<typeof createAdminClient>, profileId: string): Promise<Set<string> | 'all'> {
  const { data } = await admin.from('training_module_access').select('module_key, can_view').eq('profile_id', profileId)
  if (!data || data.length === 0) return 'all'
  return new Set(data.filter(r => r.can_view).map(r => r.module_key as string))
}

/** Catálogo completo com progresso do usuário, agrupável por módulo no cliente. */
export async function getTrainingCatalog() {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' as const }

  const [{ data: videos }, { data: progress }] = await Promise.all([
    c.admin.from('training_videos').select('id, module_key, code, title, description, duration_seconds, sort_order')
      .eq('is_active', true).order('module_key').order('sort_order'),
    c.admin.from('training_progress').select('video_id, watch_percent, completed').eq('profile_id', c.userId),
  ])
  const allowed = await allowedModules(c.admin, c.userId)
  const progMap = new Map((progress ?? []).map(p => [p.video_id as string, p]))

  const list = (videos ?? [])
    .filter(v => allowed === 'all' || allowed.has(v.module_key as string))
    .map(v => {
      const p = progMap.get(v.id as string)
      return {
        id: v.id as string,
        moduleKey: v.module_key as string,
        code: v.code as string,
        title: v.title as string,
        description: (v.description as string) ?? '',
        duration: (v.duration_seconds as number) ?? 0,
        watchPercent: p ? (p.watch_percent as number) : 0,
        completed: p ? !!p.completed : false,
      }
    })

  return { user: { name: c.name, email: c.email, role: c.role }, videos: list }
}

/** Gera um link assinado curto para o vídeo, após checar acesso ao módulo. */
export async function getVideoSignedUrl(videoId: string) {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' as const }
  const { data: v } = await c.admin.from('training_videos').select('storage_path, module_key, is_active').eq('id', videoId).single()
  if (!v || !v.is_active) return { error: 'Vídeo indisponível.' as const }
  const allowed = await allowedModules(c.admin, c.userId)
  if (allowed !== 'all' && !allowed.has(v.module_key as string)) return { error: 'Sem acesso a este módulo de treinamento.' as const }
  const { data, error } = await c.admin.storage.from(BUCKET).createSignedUrl(v.storage_path as string, SIGNED_TTL)
  if (error || !data) return { error: 'Erro ao liberar o vídeo.' as const }
  return { url: data.signedUrl, ttl: SIGNED_TTL }
}

/** Salva o progresso de visualização (chamado periodicamente pelo player). */
export async function saveVideoProgress(videoId: string, watchedSeconds: number, watchPercent: number) {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' as const }
  const pct = Math.max(0, Math.min(100, Math.round(watchPercent)))
  const completed = pct >= 90
  const { error } = await c.admin.from('training_progress').upsert({
    clinic_id: c.clinicId, profile_id: c.userId, video_id: videoId,
    watched_seconds: Math.round(watchedSeconds), watch_percent: pct,
    completed, completed_at: completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,video_id' })
  if (error) return { error: error.message }
  return { ok: true, completed }
}

/** Perguntas do quiz de um vídeo (SEM revelar a resposta correta). */
export async function getVideoQuiz(videoId: string) {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' as const }
  const { data } = await c.admin.from('training_quiz_questions')
    .select('id, question, options, sort_order').eq('video_id', videoId).order('sort_order')
  return { questions: (data ?? []).map(q => ({ id: q.id as string, question: q.question as string, options: (q.options as string[]) })) }
}

/** Valida a resposta no servidor e registra a tentativa. */
export async function submitQuizAnswer(videoId: string, questionId: string, chosenIndex: number) {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' as const }
  const { data: q } = await c.admin.from('training_quiz_questions').select('correct_index, explanation').eq('id', questionId).single()
  if (!q) return { error: 'Pergunta não encontrada.' as const }
  const isCorrect = Number(chosenIndex) === Number(q.correct_index)
  await c.admin.from('training_quiz_attempts').insert({
    clinic_id: c.clinicId, profile_id: c.userId, video_id: videoId, question_id: questionId,
    chosen_index: Math.round(chosenIndex), is_correct: isCorrect,
  })
  return { correct: isCorrect, correctIndex: q.correct_index as number, explanation: (q.explanation as string) ?? '' }
}

/** Report: pedido de vídeo novo OU problema num vídeo. */
export async function submitTrainingReport(reportType: 'request' | 'bug', message: string, videoId?: string, moduleKey?: string) {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' as const }
  if (!message || !message.trim()) return { error: 'Escreva uma mensagem.' as const }
  if (reportType !== 'request' && reportType !== 'bug') return { error: 'Tipo inválido.' as const }
  const { error } = await c.admin.from('training_reports').insert({
    clinic_id: c.clinicId, profile_id: c.userId, video_id: videoId ?? null,
    module_key: moduleKey ?? null, report_type: reportType, message: message.trim(),
  })
  if (error) return { error: error.message }
  return { ok: true }
}

// ── Painel do Gestor (admin da clínica) ──────────────────────────────────────
export async function getTrainingAdminOverview() {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' as const }
  if (c.role !== 'admin') return { error: 'Acesso restrito ao gestor.' as const }

  const [{ data: profiles }, { data: progress }, { data: videos }, { data: reports }, { data: access }] = await Promise.all([
    c.admin.from('profiles').select('id, full_name, role').eq('clinic_id', c.clinicId),
    c.admin.from('training_progress').select('profile_id, completed, updated_at').eq('clinic_id', c.clinicId),
    c.admin.from('training_videos').select('id, module_key').eq('is_active', true),
    c.admin.from('training_reports').select('id, report_type, message, status, created_at, module_key, video_id, profile_id')
      .eq('clinic_id', c.clinicId).order('created_at', { ascending: false }).limit(100),
    c.admin.from('training_module_access').select('profile_id, module_key, can_view').eq('clinic_id', c.clinicId),
  ])
  const totalVideos = (videos ?? []).length
  const vidCode = new Map<string, string>()
  const { data: vcodes } = await c.admin.from('training_videos').select('id, code')
  ;(vcodes ?? []).forEach(v => vidCode.set(v.id as string, v.code as string))
  const nameById = new Map((profiles ?? []).map(p => [p.id as string, (p.full_name as string) || 'Usuário']))

  const doneByUser = new Map<string, number>()
  const lastByUser = new Map<string, string>()
  ;(progress ?? []).forEach(p => {
    if (p.completed) doneByUser.set(p.profile_id as string, (doneByUser.get(p.profile_id as string) ?? 0) + 1)
    const cur = lastByUser.get(p.profile_id as string)
    if (!cur || (p.updated_at as string) > cur) lastByUser.set(p.profile_id as string, p.updated_at as string)
  })

  const users = (profiles ?? []).map(p => ({
    id: p.id as string,
    name: (p.full_name as string) || 'Usuário',
    role: (p.role as string) || 'user',
    completed: doneByUser.get(p.id as string) ?? 0,
    total: totalVideos,
    lastActive: lastByUser.get(p.id as string) ?? null,
  })).sort((a, b) => b.completed - a.completed)

  const reportList = (reports ?? []).map(r => ({
    id: r.id as string,
    type: r.report_type as 'request' | 'bug',
    message: r.message as string,
    status: r.status as string,
    createdAt: r.created_at as string,
    moduleKey: (r.module_key as string) ?? null,
    videoCode: r.video_id ? (vidCode.get(r.video_id as string) ?? null) : null,
    userName: r.profile_id ? (nameById.get(r.profile_id as string) ?? 'Usuário') : 'Usuário',
  }))

  const accessList = (access ?? []).map(a => ({ profileId: a.profile_id as string, moduleKey: a.module_key as string, canView: !!a.can_view }))

  return { totalVideos, users, reports: reportList, access: accessList }
}

export async function setTrainingModuleAccess(profileId: string, moduleKey: string, canView: boolean) {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' as const }
  if (c.role !== 'admin') return { error: 'Acesso restrito ao gestor.' as const }
  const { error } = await c.admin.from('training_module_access').upsert({
    clinic_id: c.clinicId, profile_id: profileId, module_key: moduleKey, can_view: canView, updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,module_key' })
  if (error) return { error: error.message }
  return { ok: true }
}

export async function updateTrainingReportStatus(reportId: string, status: 'open' | 'in_progress' | 'resolved') {
  const c = await ctx()
  if (!c) return { error: 'Não autenticado.' as const }
  if (c.role !== 'admin') return { error: 'Acesso restrito ao gestor.' as const }
  const { error } = await c.admin.from('training_reports').update({ status }).eq('id', reportId).eq('clinic_id', c.clinicId)
  if (error) return { error: error.message }
  return { ok: true }
}
