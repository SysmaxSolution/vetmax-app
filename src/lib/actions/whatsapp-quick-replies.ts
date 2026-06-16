'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface QuickReply {
  id: string
  clinic_id: string
  category: string | null
  title: string
  body: string
  sort_order: number
  created_at: string
}

async function getClinicId(): Promise<{ clinic_id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }
  return { clinic_id: profile.clinic_id }
}

export async function getQuickReplies(): Promise<QuickReply[] | { error: string }> {
  const resolved = await getClinicId()
  if ('error' in resolved) return resolved
  const { clinic_id } = resolved

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('whatsapp_quick_replies')
    .select('id, clinic_id, category, title, body, sort_order, created_at')
    .eq('clinic_id', clinic_id)
    .order('sort_order', { ascending: true })
    .order('category', { ascending: true, nullsFirst: true })

  if (error) return { error: error.message }
  return (data ?? []) as QuickReply[]
}

export async function createQuickReply(data: {
  category?: string
  title: string
  body: string
  sort_order?: number
}): Promise<{ id: string } | { error: string }> {
  const resolved = await getClinicId()
  if ('error' in resolved) return resolved
  const { clinic_id } = resolved

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('whatsapp_quick_replies')
    .insert({
      clinic_id,
      category: data.category ?? null,
      title: data.title,
      body: data.body,
      sort_order: data.sort_order ?? 0,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: row.id }
}

export async function updateQuickReply(
  id: string,
  data: Partial<{ category: string | null; title: string; body: string; sort_order: number }>,
): Promise<{ success: true } | { error: string }> {
  const resolved = await getClinicId()
  if ('error' in resolved) return resolved
  const { clinic_id } = resolved

  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_quick_replies')
    .update(data)
    .eq('id', id)
    .eq('clinic_id', clinic_id)

  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteQuickReply(id: string): Promise<{ success: true } | { error: string }> {
  const resolved = await getClinicId()
  if ('error' in resolved) return resolved
  const { clinic_id } = resolved

  const admin = createAdminClient()
  const { error } = await admin
    .from('whatsapp_quick_replies')
    .delete()
    .eq('id', id)
    .eq('clinic_id', clinic_id)

  if (error) return { error: error.message }
  return { success: true }
}

export function getDefaultQuickReplies(): QuickReply[] {
  const now = new Date().toISOString()
  const make = (
    idx: number,
    category: string | null,
    title: string,
    body: string,
  ): QuickReply => ({
    id: '',
    clinic_id: '',
    category,
    title,
    body,
    sort_order: idx,
    created_at: now,
  })

  return [
    make(0, 'Agendamento', 'Confirmação de Consulta', 'Olá, {tutor_name}! 😊 Confirmamos sua consulta para {pet_name} em *{data}* às *{hora}*. Qualquer dúvida, estamos à disposição!'),
    make(1, 'Agendamento', 'Lembrete 24h', 'Olá, {tutor_name}! 🐾 Lembramos que amanhã às *{hora}* é a consulta de {pet_name}. Responda *1* para CONFIRMAR ou *2* para CANCELAR.'),
    make(2, 'Agendamento', 'Reagendamento', 'Olá, {tutor_name}! Precisamos reagendar a consulta de {pet_name}. Por gentileza, escolha um novo horário: {link_agenda}'),
    make(3, 'Agendamento', 'Cancelamento Confirmado', 'Olá, {tutor_name}! A consulta de {pet_name} foi cancelada conforme solicitado. Para remarcar, basta entrar em contato. 🙏'),
    make(4, 'Pós-Consulta', 'Orientações Pós-Consulta', 'Olá, {tutor_name}! Seguem as orientações para {pet_name} após a consulta de hoje:\n\n📋 *Medicamentos:* {medicamentos}\n⏰ *Retorno:* {data_retorno}\n\nQualquer dúvida, entre em contato!'),
    make(5, 'Pós-Consulta', 'Resultado de Exame Disponível', 'Olá, {tutor_name}! O resultado do exame de {pet_name} já está disponível. Acesse pelo link ou entre em contato para mais informações. 🔬'),
    make(6, 'Pós-Consulta', 'Retorno Pós-Cirurgia', 'Olá, {tutor_name}! Como está {pet_name} após o procedimento? 🐕 Se notar qualquer alteração (sangramento, prostração, vômito), entre em contato imediatamente. Retorno agendado para *{data_retorno}*.'),
    make(7, 'Vacinas', 'Lembrete de Vacina', 'Olá, {tutor_name}! 💉 A vacina de {pet_name} está vencendo em *{data_vacina}*. Agende já pelo nosso WhatsApp ou pelo link: {link_agenda}'),
    make(8, 'Vacinas', 'Carteira de Vacinação', 'Olá, {tutor_name}! A carteira de vacinação de {pet_name} está em dia? 📋 Podemos verificar e atualizar no próximo retorno. Qualquer dúvida, estamos aqui!'),
    make(9, 'Financeiro', 'Boleto / Cobrança', 'Olá, {tutor_name}! Segue o boleto referente ao atendimento de {pet_name} no valor de *R$ {valor}*, com vencimento em *{vencimento}*. Em caso de dúvidas, estamos à disposição. 🙏'),
  ]
}
