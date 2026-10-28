'use server'

// Acesso de usuários às clínicas do grupo.
//
// Antes, o vínculo em user_clinics só nascia no cadastro ou no convite — e os
// dois recusam e-mail já existente. Dar uma segunda clínica a alguém exigia
// SQL na mão. Aqui o administrador faz isso na tela do usuário, limitado às
// clínicas do grupo (Empresas ligadas por CNPJ, ver src/lib/clinics/grupo-empresas.ts).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from '@/lib/errors'
import { clinicasDoGrupo } from '@/lib/server/grupo-de-clinicas'
import type { AcessoClinicaDoGrupo } from '@/types/clinic-group'

async function contextoAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' as const }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role, is_sysmax')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' as const }
  if (profile.role !== 'admin' && !profile.is_sysmax) return { error: 'Só administradores alteram acessos.' as const }
  return { admin, userId: user.id, clinicId: profile.clinic_id as string }
}

/** O usuário pertence à clínica em que o admin está? (vínculo ou clínica ativa) */
async function usuarioDaClinica(admin: ReturnType<typeof createAdminClient>, userId: string, clinicId: string) {
  const { data: perfil } = await admin.from('profiles').select('id, clinic_id, role, is_sysmax').eq('id', userId).maybeSingle()
  if (!perfil || perfil.is_sysmax) return null
  if (perfil.clinic_id === clinicId) return perfil
  const { data: vinculo } = await admin.from('user_clinics').select('id').eq('user_id', userId).eq('clinic_id', clinicId).maybeSingle()
  return vinculo ? perfil : null
}

export async function listarAcessoDoUsuarioNoGrupo(
  userId: string,
): Promise<{ clinicas: AcessoClinicaDoGrupo[] } | { error: string }> {
  const ctx = await contextoAdmin()
  if ('error' in ctx) return { error: ctx.error as string }
  const { admin, clinicId } = ctx

  const perfil = await usuarioDaClinica(admin, userId, clinicId)
  if (!perfil) return { error: 'Usuário não pertence a esta clínica.' }

  const grupo = await clinicasDoGrupo(admin, clinicId)
  const { data: vinculos } = await admin.from('user_clinics').select('clinic_id').eq('user_id', userId)
  const vinculadas = new Set((vinculos ?? []).map(v => v.clinic_id))

  return {
    clinicas: grupo.map(c => ({
      id: c.id, name: c.name, cnpj: c.cnpj,
      vinculado: vinculadas.has(c.id) || perfil.clinic_id === c.id,
      atual: c.id === clinicId,
      ativaDoUsuario: perfil.clinic_id === c.id,
    })),
  }
}

export async function definirAcessoDoUsuarioNaClinica(
  userId: string,
  clinicaAlvo: string,
  vinculado: boolean,
): Promise<{ success: true } | { error: string }> {
  const ctx = await contextoAdmin()
  if ('error' in ctx) return { error: ctx.error as string }
  const { admin, clinicId } = ctx

  const perfil = await usuarioDaClinica(admin, userId, clinicId)
  if (!perfil) return { error: 'Usuário não pertence a esta clínica.' }

  // Só clínicas do grupo — nunca um id qualquer vindo do cliente.
  const grupo = await clinicasDoGrupo(admin, clinicId)
  const alvo = grupo.find(c => c.id === clinicaAlvo)
  if (!alvo) return { error: 'Essa clínica não faz parte do grupo desta clínica.' }

  if (vinculado) {
    // O papel na clínica nova é o mesmo que a pessoa tem aqui; o admin de lá ajusta depois se quiser.
    const { data: aqui } = await admin.from('user_clinics').select('role').eq('user_id', userId).eq('clinic_id', clinicId).maybeSingle()
    const role = aqui?.role ?? perfil.role ?? 'receptionist'
    const { error } = await admin.from('user_clinics')
      .upsert({ user_id: userId, clinic_id: clinicaAlvo, role }, { onConflict: 'user_id,clinic_id' })
    if (error) return { error: `Erro ao liberar acesso: ${mensagemErro(error, 'lib/actions/clinic-group-access.ts')}` }
  } else {
    // Ninguém tira o próprio acesso à clínica em que está: travaria o admin para fora.
    if (userId === ctx.userId && clinicaAlvo === clinicId) return { error: 'Você não pode remover seu próprio acesso à clínica atual.' }

    const { data: vinculos } = await admin.from('user_clinics').select('clinic_id').eq('user_id', userId)
    const restantes = (vinculos ?? []).map(v => v.clinic_id).filter(id => id !== clinicaAlvo)
    if (!restantes.length) return { error: 'O usuário precisa ter acesso a pelo menos uma clínica. Para bloquear a pessoa, desative o usuário.' }

    const { error } = await admin.from('user_clinics').delete().eq('user_id', userId).eq('clinic_id', clinicaAlvo)
    if (error) return { error: `Erro ao remover acesso: ${mensagemErro(error, 'lib/actions/clinic-group-access.ts')}` }

    // Se a clínica removida era a ativa da pessoa, ela passa a entrar em outra que ainda tem.
    if (perfil.clinic_id === clinicaAlvo) {
      const destino = restantes.includes(clinicId) ? clinicId : restantes[0]
      const { data: papel } = await admin.from('user_clinics').select('role').eq('user_id', userId).eq('clinic_id', destino).maybeSingle()
      await admin.from('profiles').update({ clinic_id: destino, role: papel?.role ?? perfil.role }).eq('id', userId)
    }
  }

  revalidatePath('/dashboard/management')
  return { success: true }
}
