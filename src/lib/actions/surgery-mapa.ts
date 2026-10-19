'use server'

// Mapa das cirurgias do dia (Fase 4 · item 4.3) e gate do pré-anestésico
// (item 4.2).
//
// O mapa substitui o quadro que o Vinícius mantém à mão. Vai além da lista de
// horários de propósito: cada linha mostra o que falta no pré-anestésico, se a
// cirurgia foi liberada à força e se sobrou kit sem conferir — porque é olhando
// o mapa que se decide o que fazer no dia, e essas três coisas são justamente o
// que custa dinheiro ou segurança quando passa batido.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from '@/lib/errors'
import { logAudit } from './audit'
import { avaliarGate, lerConfigGate, ROTULO_EXIGENCIA } from '@/lib/surgery/gate-preanestesico'
import type { ChecklistAvaliavel, ExigenciaPreAnestesica } from '@/lib/surgery/gate-preanestesico'
import type { MapaDoDia, LinhaDoMapa } from '@/types/estoque-reposicao'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' as const }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' as const }
  return { admin, clinicId: profile.clinic_id as string, role: (profile.role as string) ?? 'staff', userId: user.id }
}

function hojeLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Lê a configuração do gate da clínica uma vez, para reusar no laço. */
async function configDaClinica(admin: ReturnType<typeof createAdminClient>, clinicId: string) {
  const { data } = await admin.from('clinics').select('flow_config').eq('id', clinicId).single()
  return lerConfigGate((data?.flow_config ?? {}) as Record<string, unknown>)
}

const umNome = (v: unknown): string | null => {
  const o = Array.isArray(v) ? v[0] : v
  return (o as { name?: string; full_name?: string } | null)?.full_name
    ?? (o as { name?: string } | null)?.name
    ?? null
}

// ─── 4.3 · mapa do dia ──────────────────────────────────────────────────────

/**
 * Cirurgias de um dia, em ordem de horário.
 *
 * Cirurgia sem horário previsto entra no fim da lista em vez de ficar de fora:
 * encaixe de urgência não tem hora marcada e é exatamente o que ninguém pode
 * perder de vista.
 */
export async function getMapaDoDia(data?: string): Promise<MapaDoDia | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const { admin, clinicId } = ctx

  const dia = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hojeLocal()
  const inicio = dia + 'T00:00:00'
  const fim = dia + 'T23:59:59'

  const { data: cirurgias, error } = await admin
    .from('surgeries')
    .select(`
      id, procedure_name, status, asa_risk, checklist,
      scheduled_at, scheduled_duration, started_at, created_at,
      sala:rooms ( name ),
      cirurgiao:profiles!surgeries_surgeon_id_fkey ( full_name ),
      anestesista:profiles!surgeries_anesthetist_id_fkey ( full_name ),
      paciente:patients ( name, species, tutor:tutors ( name ) )
    `)
    .eq('clinic_id', clinicId)
    .neq('status', 'canceled')
    // A cirurgia entra no mapa do dia pela hora prevista; sem ela, pela data de
    // criação — é o encaixe que nasceu hoje mesmo.
    .or(`and(scheduled_at.gte.${inicio},scheduled_at.lte.${fim}),and(scheduled_at.is.null,created_at.gte.${inicio},created_at.lte.${fim})`)
  if (error) return { error: 'Erro ao montar o mapa do dia: ' + mensagemErro(error, 'lib/actions/surgery-mapa.ts') }

  const lista = cirurgias ?? []
  if (lista.length === 0) {
    return { data: dia, linhas: [], totais: { total: 0, em_sala: 0, concluidas: 0, bloqueadas: 0 } }
  }

  const config = await configDaClinica(admin, clinicId)
  const ids = lista.map(c => c.id as string)

  // Liberações forçadas e kits sem conferir, em duas consultas em lote.
  const { data: overrides } = await admin
    .from('surgery_gate_overrides')
    .select('surgery_id')
    .eq('clinic_id', clinicId)
    .in('surgery_id', ids)
  const comOverride = new Set((overrides ?? []).map(o => o.surgery_id as string))

  const { data: kits } = await admin
    .from('surgery_kit_applications')
    .select('surgery_id')
    .eq('clinic_id', clinicId)
    .eq('status', 'aplicado')
    .in('surgery_id', ids)
  const kitsPendentes = new Map<string, number>()
  for (const k of kits ?? []) {
    const chave = k.surgery_id as string
    kitsPendentes.set(chave, (kitsPendentes.get(chave) ?? 0) + 1)
  }

  const linhas: LinhaDoMapa[] = lista.map(c => {
    const avaliacao = avaliarGate({
      checklist: (c.checklist ?? {}) as ChecklistAvaliavel,
      asaRisk:   (c.asa_risk as string | null) ?? null,
      config,
    })
    const pacienteRaw = (c as Record<string, unknown>).paciente
    const paciente = (Array.isArray(pacienteRaw) ? pacienteRaw[0] : pacienteRaw) as {
      name?: string; species?: string; tutor?: { name?: string } | { name?: string }[] | null
    } | null

    const agendado = c.scheduled_at as string | null
    const hora = agendado
      ? new Date(agendado).toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
        })
      : null

    return {
      id:              c.id as string,
      hora,
      duracao_min:     c.scheduled_duration === null ? null : Number(c.scheduled_duration),
      procedure_name:  c.procedure_name as string,
      status:          c.status as LinhaDoMapa['status'],
      pet_nome:        paciente?.name ?? null,
      tutor_nome:      umNome(paciente?.tutor),
      especie:         paciente?.species ?? null,
      sala:            umNome((c as Record<string, unknown>).sala),
      cirurgiao:       umNome((c as Record<string, unknown>).cirurgiao),
      anestesista:     umNome((c as Record<string, unknown>).anestesista),
      asa_risk:        (c.asa_risk as string | null) ?? null,
      bloqueios:       avaliacao.bloqueios.map(b => ROTULO_EXIGENCIA[b]),
      avisos:          avaliacao.avisos.map(a => ROTULO_EXIGENCIA[a]),
      liberada_a_forca: comOverride.has(c.id as string),
      kits_pendentes:   kitsPendentes.get(c.id as string) ?? 0,
    }
  })

  // Hora primeiro; sem hora vai para o fim (encaixe), e aí por procedimento.
  linhas.sort((a, b) => {
    if (a.hora && b.hora) return a.hora.localeCompare(b.hora)
    if (a.hora) return -1
    if (b.hora) return 1
    return a.procedure_name.localeCompare(b.procedure_name, 'pt-BR')
  })

  return {
    data: dia,
    linhas,
    totais: {
      total:      linhas.length,
      em_sala:    linhas.filter(l => l.status === 'sala').length,
      concluidas: linhas.filter(l => l.status === 'done').length,
      bloqueadas: linhas.filter(l => l.bloqueios.length > 0 && l.status === 'preparo').length,
    },
  }
}

/** Grava o horário previsto e a duração — é o que o mapa do dia ordena. */
export async function agendarCirurgia(input: {
  surgeryId:   string
  scheduledAt: string | null
  duracaoMin?: number | null
  roomId?:     string | null
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const patch: Record<string, unknown> = {
    scheduled_at: input.scheduledAt || null,
    updated_at:   new Date().toISOString(),
  }
  if (input.duracaoMin !== undefined) patch.scheduled_duration = input.duracaoMin ?? null
  if (input.roomId !== undefined)     patch.room_id = input.roomId || null

  const { error } = await ctx.admin
    .from('surgeries')
    .update(patch)
    .eq('id', input.surgeryId)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Erro ao agendar: ' + mensagemErro(error, 'lib/actions/surgery-mapa.ts') }

  revalidatePath('/dashboard/surgery')
  return { ok: true }
}

// ─── 4.2 · gate do pré-anestésico ───────────────────────────────────────────

/**
 * Avalia se a cirurgia pode entrar na sala.
 *
 * Só leitura — quem decide barrar é `updateSurgeryStatus`. Esta função existe
 * para a tela mostrar a pendência ANTES de a pessoa tentar mover o paciente.
 */
export async function avaliarGatePreAnestesico(surgeryId: string): Promise<{
  liberado:  boolean
  bloqueios: string[]
  avisos:    string[]
  mensagem:  string
} | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const { data: s } = await ctx.admin
    .from('surgeries')
    .select('checklist, asa_risk')
    .eq('id', surgeryId)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle()
  if (!s) return { error: 'Cirurgia não encontrada nesta clínica.' }

  const config = await configDaClinica(ctx.admin, ctx.clinicId)
  const r = avaliarGate({
    checklist: (s.checklist ?? {}) as ChecklistAvaliavel,
    asaRisk:   (s.asa_risk as string | null) ?? null,
    config,
  })
  return {
    liberado:  r.liberado,
    bloqueios: r.bloqueios.map(b => ROTULO_EXIGENCIA[b]),
    avisos:    r.avisos.map(a => ROTULO_EXIGENCIA[a]),
    mensagem:  r.mensagem,
  }
}

/**
 * Libera a entrada em sala sem o pré-anestésico cumprido, com motivo.
 *
 * Urgência acontece — cesárea de emergência não espera hemograma. O que não
 * acontece é a liberação ficar sem autor e sem motivo: isso vira registro em
 * `surgery_gate_overrides` e marca a linha da cirurgia no mapa do dia.
 */
export async function liberarGateComMotivo(input: {
  surgeryId: string
  motivo:    string
}): Promise<{ ok: true; liberou: string[] } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  // Alçada: liberar o pré-anestésico é decisão clínica, não operacional.
  if (!['admin', 'owner', 'manager', 'vet'].includes(ctx.role)) {
    return { error: 'Só o Médico Veterinário ou a gestão pode liberar o pré-anestésico.' }
  }
  const motivo = input.motivo?.trim() ?? ''
  if (motivo.length < 3) return { error: 'Descreva o motivo da liberação.' }

  const { data: s } = await ctx.admin
    .from('surgeries')
    .select('checklist, asa_risk, procedure_name')
    .eq('id', input.surgeryId)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle()
  if (!s) return { error: 'Cirurgia não encontrada nesta clínica.' }

  const config = await configDaClinica(ctx.admin, ctx.clinicId)
  const avaliacao = avaliarGate({
    checklist: (s.checklist ?? {}) as ChecklistAvaliavel,
    asaRisk:   (s.asa_risk as string | null) ?? null,
    config,
  })
  if (avaliacao.liberado) {
    return { error: 'Não há nada pendente para liberar — a cirurgia já pode ir para a sala.' }
  }

  const faltando: ExigenciaPreAnestesica[] = avaliacao.bloqueios
  const { error } = await ctx.admin.from('surgery_gate_overrides').insert({
    clinic_id:     ctx.clinicId,
    surgery_id:    input.surgeryId,
    target_status: 'sala',
    missing:       faltando,
    reason:        motivo,
    released_by:   ctx.userId,
  })
  if (error) return { error: 'Erro ao registrar a liberação: ' + mensagemErro(error, 'lib/actions/surgery-mapa.ts') }

  await logAudit({
    action: 'SURGERY_GATE_OVERRIDE',
    entity_type: 'surgeries',
    entity_id: input.surgeryId,
    details: {
      procedure: (s as { procedure_name?: string }).procedure_name ?? null,
      faltando,
      motivo,
    },
  })

  revalidatePath('/dashboard/surgery')
  return { ok: true, liberou: faltando.map(f => ROTULO_EXIGENCIA[f]) }
}
