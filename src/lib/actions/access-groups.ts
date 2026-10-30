'use server'

/**
 * Grupos de acesso — Diretoria, Recepção, Veterinários, Caixa, Estoque…
 *
 * Pedido da Clínica Animais (30/10/2026): hoje cada pessoa é configurada do
 * zero, repetindo à mão os mesmos módulos e direitos da anterior. O grupo é o
 * molde: a clínica cria os grupos que quiser, diz o que cada um acessa, e ao
 * colocar alguém num grupo os acessos entram prontos — podendo ser ajustados
 * pessoa a pessoa depois, sem mexer no grupo nem em quem já está nele.
 *
 * Importante: o grupo NÃO é consultado na hora de autorizar. Quem autoriza
 * continua sendo `user_module_access` e `user_permissions_granular`; aplicar o
 * grupo escreve nessas duas tabelas. Assim nada muda nas checagens existentes
 * e um ajuste individual nunca é desfeito por engano.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from '@/lib/errors'
import type { AccessGroup, AccessGroupInput, AplicacaoDeGrupo } from '@/types/access-groups'

async function contexto(): Promise<{ clinic_id: string; role: string; user_id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  return { clinic_id: profile.clinic_id as string, role: profile.role as string, user_id: user.id }
}

/** Lista os grupos da clínica, com quantas pessoas estão em cada um. */
export async function listarGruposDeAcesso(): Promise<AccessGroup[] | { error: string }> {
  const ctx = await contexto()
  if ('error' in ctx) return { error: ctx.error }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('access_groups')
    .select('id, name, description, modules, rights, created_at')
    .eq('clinic_id', ctx.clinic_id)
    .order('name')
  if (error) return { error: mensagemErro(error, 'lib/actions/access-groups.ts') }

  const grupos = (data ?? []) as Omit<AccessGroup, 'pessoas'>[]
  if (grupos.length === 0) return []

  const { data: pessoas } = await admin
    .from('profiles')
    .select('access_group_id')
    .eq('clinic_id', ctx.clinic_id)
    .not('access_group_id', 'is', null)

  const contagem = new Map<string, number>()
  for (const p of (pessoas ?? []) as { access_group_id: string }[]) {
    contagem.set(p.access_group_id, (contagem.get(p.access_group_id) ?? 0) + 1)
  }

  return grupos.map(g => ({ ...g, pessoas: contagem.get(g.id) ?? 0 }))
}

/** Cria ou atualiza um grupo. Só administradores. */
export async function salvarGrupoDeAcesso(
  input: AccessGroupInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await contexto()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem configurar grupos de acesso.' }

  const nome = (input.name ?? '').trim()
  if (!nome) return { error: 'Dê um nome ao grupo (ex.: Recepção).' }
  if (nome.length > 60) return { error: 'O nome do grupo deve ter no máximo 60 caracteres.' }

  const admin = createAdminClient()
  const campos = {
    clinic_id:   ctx.clinic_id,
    name:        nome,
    description: (input.description ?? '').trim() || null,
    modules:     input.modules ?? [],
    rights:      input.rights ?? [],
    updated_at:  new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await admin
      .from('access_groups').update(campos)
      .eq('id', input.id).eq('clinic_id', ctx.clinic_id)
      .select('id').maybeSingle()
    if (error) return { error: mensagemErro(error, 'lib/actions/access-groups.ts') }
    if (!data) return { error: 'Grupo não encontrado nesta clínica.' }
    revalidatePath('/dashboard/management')
    return { id: data.id as string }
  }

  const { data, error } = await admin
    .from('access_groups').insert({ ...campos, created_by: ctx.user_id })
    .select('id').single()
  if (error) return { error: mensagemErro(error, 'lib/actions/access-groups.ts') }
  revalidatePath('/dashboard/management')
  return { id: data.id as string }
}

/**
 * Apaga o grupo. Quem estava nele mantém os acessos que já tem — o grupo era
 * o molde, não a fonte da permissão.
 */
export async function excluirGrupoDeAcesso(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await contexto()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem excluir grupos de acesso.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('access_groups').delete().eq('id', id).eq('clinic_id', ctx.clinic_id)
  if (error) return { error: mensagemErro(error, 'lib/actions/access-groups.ts') }
  revalidatePath('/dashboard/management')
  return { success: true }
}

/**
 * Coloca a pessoa no grupo e copia os acessos do grupo para o cadastro dela.
 *
 * Os acessos do grupo substituem os que ela tinha — é o que "pré-carregar"
 * significa aqui. Depois disso, qualquer ajuste individual vale e não é
 * desfeito, porque nada relê o grupo.
 */
export async function aplicarGrupoAoUsuario(
  targetUserId: string,
  groupId: string | null,
): Promise<AplicacaoDeGrupo | { error: string }> {
  const ctx = await contexto()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem alterar acessos.' }
  if (targetUserId === ctx.user_id) return { error: 'Você não pode alterar os próprios acessos.' }

  const admin = createAdminClient()
  const { data: alvo } = await admin
    .from('profiles').select('id, clinic_id').eq('id', targetUserId).maybeSingle()
  if (!alvo) return { error: 'Usuário não encontrado.' }
  if (alvo.clinic_id !== ctx.clinic_id) return { error: 'Usuário de outra clínica.' }

  // Tirar do grupo: só solta o rótulo, os acessos atuais ficam como estão.
  if (!groupId) {
    const { error } = await admin.from('profiles').update({ access_group_id: null }).eq('id', targetUserId)
    if (error) return { error: mensagemErro(error, 'lib/actions/access-groups.ts') }
    revalidatePath('/dashboard/management')
    return { modulos: 0, direitos: 0, grupo: null }
  }

  const { data: grupo } = await admin
    .from('access_groups').select('id, name, modules, rights')
    .eq('id', groupId).eq('clinic_id', ctx.clinic_id).maybeSingle()
  if (!grupo) return { error: 'Grupo não encontrado nesta clínica.' }

  const modulos = (grupo.modules ?? []) as string[]
  const direitos = (grupo.rights ?? []) as { module: string; action: string; allowed: boolean }[]

  // Módulos visíveis: o grupo manda. Os que estavam ligados e não estão no
  // grupo são desligados, senão "aplicar Recepção" deixaria sobras do papel
  // anterior.
  const { data: catalogo } = await admin
    .from('user_module_access').select('module_name')
    .eq('clinic_id', ctx.clinic_id).eq('user_id', targetUserId)
  const existentes = new Set((catalogo ?? []).map(r => r.module_name as string))
  const todos = new Set<string>([...existentes, ...modulos])

  for (const nome of todos) {
    await admin.from('user_module_access').upsert({
      clinic_id:   ctx.clinic_id,
      user_id:     targetUserId,
      module_name: nome,
      enabled:     modulos.includes(nome),
    }, { onConflict: 'clinic_id,user_id,module_name' })
  }

  // Direitos detalhados: limpa os anteriores e grava os do grupo. Sem a
  // limpeza, uma negativa antiga sobreviveria à troca de grupo.
  await admin.from('user_permissions_granular')
    .delete().eq('clinic_id', ctx.clinic_id).eq('user_id', targetUserId)

  if (direitos.length > 0) {
    const linhas = direitos.map(d => ({
      clinic_id: ctx.clinic_id,
      user_id:   targetUserId,
      module:    d.module,
      action:    d.action,
      allowed:   d.allowed,
    }))
    const { error } = await admin
      .from('user_permissions_granular')
      .upsert(linhas, { onConflict: 'clinic_id,user_id,module,action' })
    if (error) return { error: mensagemErro(error, 'lib/actions/access-groups.ts') }
  }

  const { error: eProfile } = await admin
    .from('profiles').update({ access_group_id: groupId }).eq('id', targetUserId)
  if (eProfile) return { error: mensagemErro(eProfile, 'lib/actions/access-groups.ts') }

  revalidatePath('/dashboard/management')
  return { modulos: modulos.length, direitos: direitos.length, grupo: grupo.name as string }
}

/** Em qual grupo a pessoa está hoje (null = nenhum). */
export async function grupoAtualDoUsuario(
  targetUserId: string,
): Promise<{ groupId: string | null } | { error: string }> {
  const ctx = await contexto()
  if ('error' in ctx) return { error: ctx.error }

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles').select('access_group_id, clinic_id')
    .eq('id', targetUserId).maybeSingle()
  if (!data) return { error: 'Usuário não encontrado.' }
  if (data.clinic_id !== ctx.clinic_id) return { error: 'Usuário de outra clínica.' }
  return { groupId: (data.access_group_id as string | null) ?? null }
}
