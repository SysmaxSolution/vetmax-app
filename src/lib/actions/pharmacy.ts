'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from './audit'
import { deductStockForMedication } from './stock'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AppliedMedication = {
  id: string
  consultation_id: string
  medication_name: string
  dosage: string | null
  route: string | null
  notes: string | null
  is_controlled: boolean
  created_at: string
}

export type Referral = {
  id: string
  consultation_id: string
  type: 'exam_internal' | 'exam_external' | 'prescription_external'
  description: string
  doctor_notes: string | null
  created_at: string
}

export type ExtractedClinicalActions = {
  medications: Array<{
    medication_name: string
    dosage: string | null
    route: string | null
    notes: string | null
  }>
  referrals: Array<{
    type: 'exam_internal' | 'exam_external' | 'prescription_external'
    description: string
    doctor_notes: string | null
  }>
}

// ─── Medicações Aplicadas ─────────────────────────────────────────────────────

export async function getAppliedMedications(
  consultationId: string
): Promise<AppliedMedication[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('applied_medications')
    .select('id, consultation_id, medication_name, dosage, route, notes, is_controlled, created_at')
    .eq('consultation_id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar medicações: ' + error.message }
  return (data ?? []) as AppliedMedication[]
}

export async function addAppliedMedication(data: {
  consultation_id: string
  medication_name: string
  dosage?: string
  route?: string
  notes?: string
  is_controlled?: boolean
}): Promise<AppliedMedication | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  const { data: result, error } = await admin
    .from('applied_medications')
    .insert({
      clinic_id:       profile.clinic_id,
      consultation_id: data.consultation_id,
      medication_name: data.medication_name,
      dosage:          data.dosage ?? null,
      route:           data.route ?? null,
      notes:           data.notes ?? null,
      is_controlled:   data.is_controlled ?? false,
      administered_by: user.id,
    })
    .select('id, consultation_id, medication_name, dosage, route, notes, is_controlled, created_at')
    .single()

  if (error || !result) return { error: 'Erro ao registrar medicação: ' + (error?.message ?? '') }

  await logAudit({
    action: 'ADD_MEDICATION',
    entity_type: 'applied_medications',
    entity_id: result.id,
    details: { medication_name: data.medication_name, is_controlled: data.is_controlled ?? false, consultation_id: data.consultation_id },
  })

  // Abatimento automático de estoque (falha silenciosa — não bloqueia o fluxo clínico)
  await deductStockForMedication({
    clinicId:       profile.clinic_id,
    userId:         user.id,
    medicationName: data.medication_name,
    source:         'CONSULTATION',
    referenceId:    data.consultation_id,
  })

  revalidatePath(`/dashboard/vet/${data.consultation_id}`)
  return result as AppliedMedication
}

export async function deleteAppliedMedication(
  id: string,
  consultationId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { error } = await supabase
    .from('applied_medications')
    .delete()
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao remover medicação: ' + error.message }

  // 1. PRIMEIRO LOGAMOS A AUDITORIA (Usando 'id' em vez de 'medicationId')
  await logAudit({
    action: 'DELETE_MEDICATION',
    entity_type: 'applied_medications',
    entity_id: id, 
    details: { 
      consultation_id: consultationId,
      reason: 'Removido manualmente pelo painel' 
    }
  })

  // 2. DEPOIS RETORNAMOS O SUCESSO
  revalidatePath(`/dashboard/vet/${consultationId}`)
  return { success: true }
}

export async function updateAppliedMedication(
  id: string,
  consultationId: string,
  data: { medication_name: string; dosage?: string; route?: string; notes?: string; is_controlled?: boolean }
): Promise<AppliedMedication | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data: result, error } = await supabase
    .from('applied_medications')
    .update({
      medication_name: data.medication_name,
      dosage:          data.dosage ?? null,
      route:           data.route  ?? null,
      notes:           data.notes  ?? null,
      ...(data.is_controlled !== undefined && { is_controlled: data.is_controlled }),
    })
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .select('id, consultation_id, medication_name, dosage, route, notes, is_controlled, created_at')
    .single()

  if (error || !result) return { error: 'Erro ao atualizar medicação: ' + (error?.message ?? '') }

  await logAudit({
    action: 'UPDATE_MEDICATION',
    entity_type: 'applied_medications',
    entity_id: id,
    details: { medication_name: data.medication_name, consultation_id: consultationId },
  })

  revalidatePath(`/dashboard/vet/${consultationId}`)
  return result as AppliedMedication
}

// ─── Encaminhamentos e Receitas ───────────────────────────────────────────────

export async function getReferrals(
  consultationId: string
): Promise<Referral[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('referrals_and_external_rx')
    .select('id, consultation_id, type, description, doctor_notes, created_at')
    .eq('consultation_id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar encaminhamentos: ' + error.message }
  return (data ?? []) as Referral[]
}

export async function addReferral(data: {
  consultation_id: string
  type: 'exam_internal' | 'exam_external' | 'prescription_external'
  description: string
  doctor_notes?: string
}): Promise<Referral | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  const { data: result, error } = await admin
    .from('referrals_and_external_rx')
    .insert({
      clinic_id:       profile.clinic_id,
      consultation_id: data.consultation_id,
      type:            data.type,
      description:     data.description,
      doctor_notes:    data.doctor_notes ?? null,
    })
    .select('id, consultation_id, type, description, doctor_notes, created_at')
    .single()

  if (error || !result) return { error: 'Erro ao registrar encaminhamento: ' + (error?.message ?? '') }

  revalidatePath(`/dashboard/vet/${data.consultation_id}`)
  return result as Referral
}

export async function deleteReferral(
  id: string,
  consultationId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { error } = await supabase
    .from('referrals_and_external_rx')
    .delete()
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao remover encaminhamento: ' + error.message }

  revalidatePath(`/dashboard/vet/${consultationId}`)
  return { success: true }
}

// ─── Extração Completa via Voz (Single Voice Engine) ─────────────────────────

export type VoiceExtractionResult = {
  notas_clinicas: string
  medicacoes_aplicadas: Array<{
    medication_name: string
    dosage: string | null
    route: 'IV' | 'IM' | 'SC' | 'oral' | 'topical' | 'other' | null
    notes: string | null
    is_controlled?: boolean
  }>
  documentos_sugeridos: Array<{
    tipo: 'receita' | 'encaminhamento' | 'exame' | 'laudo'
    motivo: string
    title: string
    summary: string
    is_controlled?: boolean
  }>
  agendamentos_sugeridos: Array<{
    data_sugerida: string   // YYYY-MM-DD
    motivo: string          // "Retorno" | "Consulta" | "Exame" | "Vacinação" | "Cirurgia"
  }>
  sinais_vitais?: {
    weight?:           number | null
    temperature?:      number | null
    heart_rate?:       number | null
    respiratory_rate?: number | null
    chief_complaint?:  string | null
  }
  laudo_exame?: string
  vaccines_applied?: Array<{
    vaccine_name:  string
    next_due_date: string | null
    notes:         string | null
  }>
  // NOVO: Cadastro Vivo
  pet_profile_updates?: {
    medical_history?: string | null
    reproductive_status?: string | null
    coat_color?: string | null
    behavior_tags?: string[]
  }
  // NOVO: Roteamento por Voz
  suggested_routing?: 'discharge' | 'hospitalization' | 'exams' | 'waiting_exam' | null

}
export type FlowConfigInput = {
  vet_merged_modules: Array<'triage' | 'exams'>
}

export async function extractFullVoice(
  transcript: string,
  patientContext: {
    name: string
    species: string
    weight?: number
    allergies?: string
    vet_notes?: string
  },
  flowConfig?: FlowConfigInput
): Promise<VoiceExtractionResult | { error: string }> {
  if (!transcript.trim()) return { error: 'Transcrição vazia.' }

  const today = new Date()
  const todayIso = today.toISOString().split('T')[0]
  const todayFormatted = today.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  const merged = flowConfig?.vet_merged_modules ?? []
  const triageMerged = merged.includes('triage')
  const examsMerged  = merged.includes('exams')

  // Aumentamos de 6 para 7 chaves base
  const totalKeys = 7 + (triageMerged ? 1 : 0) + (examsMerged ? 1 : 0)

  const triageBlock = triageMerged ? `

${totalKeys - (examsMerged ? 1 : 0)}. "sinais_vitais": objeto com os sinais vitais mencionados. Extraia APENAS valores mencionados explicitamente; use null para os não mencionados:
   {"weight": número em kg ou null, "temperature": número em °C ou null, "heart_rate": número em bpm ou null, "respiratory_rate": número em mrpm ou null, "chief_complaint": "queixa principal resumida ou null"}
   Exemplos de detecção: "pesa 5kg" → weight: 5; "temperatura 39" → temperature: 39; "frequência cardíaca 80" → heart_rate: 80` : ''

  const examsBlock = examsMerged ? `

${totalKeys}. "laudo_exame": string com o laudo ou resultado de exame ditado pelo veterinário...` : ''

  const dynamicKeys = [
    '"notas_clinicas"',
    '"medicacoes_aplicadas"',
    '"documentos_sugeridos"',
    '"agendamentos_sugeridos"',
    '"vaccines_applied"',
    '"pet_profile_updates"',
    '"suggested_routing"', // <--- ADICIONE ESTA CHAVE
    ...(triageMerged ? ['"sinais_vitais"'] : []),
    ...(examsMerged  ? ['"laudo_exame"']   : []),
  ].join(', ')

  const prompt = `Você é um assistente clínico veterinário com IA. Analise a transcrição e extraia ${totalKeys} categorias estruturadas.${triageMerged || examsMerged ? ' Este consultório opera em FLUXO CONTÍNUO: o veterinário realiza triagem e/ou exames na mesma sessão.' : ''}

CONTEXTO TEMPORAL: Hoje é ${todayFormatted} (${todayIso}). Use essa data para calcular datas de retorno mencionadas pelo veterinário.

CONTEXTO DO ANIMAL:
- Nome: ${patientContext.name}
- Espécie: ${patientContext.species}
- Peso: ${patientContext.weight ? patientContext.weight + ' kg' : 'não informado'}
- Alergias: ${patientContext.allergies || 'nenhuma conhecida'}
- Notas já registradas: ${patientContext.vet_notes ? '"' + patientContext.vet_notes.slice(0, 300) + '"' : 'nenhuma'}

TRANSCRIÇÃO DO VETERINÁRIO:
"${transcript}"

RETORNE UM JSON com exatamente estas ${totalKeys} chaves: ${dynamicKeys}

1. "notas_clinicas": string com o texto clínico para o PRONTUÁRIO veterinário (SOAP: Subjetivo, Objetivo, Avaliação, Plano). Inclua queixa principal, achados clínicos e conduta veterinária. Se não houver conteúdo, retorne string vazia.

2. "medicacoes_aplicadas": array de medicações administradas no animal durante a consulta.
   Cada item: {"medication_name": "nome", "dosage": "dose ou null", "route": "IV|IM|SC|oral|topical|other|null", "notes": "observações ou null", "is_controlled": true|false}
   Se nenhuma medicação foi mencionada, retorne array vazio.

3. "documentos_sugeridos": array de documentos clínicos que devem ser gerados para este atendimento.
   Cada item: {"tipo": "receita|encaminhamento|exame|laudo", "title": "título específico do documento (ex: 'Receita Digital: Dipirona + Meloxicam')", "summary": "resumo curto da prescrição/indicação (ex: 'Dosagem oral por 5 dias, jejum 2h antes')", "motivo": "motivo clínico completo", "is_controlled": true|false}
   Exemplos de title: "Receita: Amoxicilina 250mg", "Encaminhamento: Cardiologista Veterinário", "Solicitação de Exame: Hemograma + Bioquímica", "Laudo Pós-Cirúrgico"
   Exemplos de summary: "Via oral, 1 comprimido a cada 12h por 7 dias", "Suspeita de cardiopatia — ECG urgente", "Em jejum de 8h", "Alta após recuperação anestésica"
   Se nenhum documento for necessário, retorne array vazio.

4. "agendamentos_sugeridos": array de agendamentos futuros mencionados pelo veterinário.
   Cada item: {"data_sugerida": "YYYY-MM-DD calculada a partir de hoje (${todayIso})", "motivo": "Retorno|Consulta|Exame|Vacinação|Cirurgia"}
   Se nenhum agendamento foi mencionado, retorne array vazio.

5. "vaccines_applied": array de vacinas aplicadas durante esta consulta.
   Cada item: {"vaccine_name": "nome da vacina", "next_due_date": "YYYY-MM-DD da próxima dose ou null", "notes": "observações ou null"}
   Se nenhuma vacina foi aplicada, retorne array vazio.

6. "pet_profile_updates": objeto com fofocas e fatos novos sobre o histórico fixo do paciente (Cadastro Vivo) que não sejam apenas desta consulta.
   {"medical_history": "novo histórico/alergia ou null", "reproductive_status": "Castrado|Inteiro ou null", "coat_color": "cor da pelagem ou null", "behavior_tags": ["Agressivo", "Medroso", "Dócil"] ou []}
   Exemplo: Se o médico disser "Tutor relata que ele desenvolveu alergia a frango", adicione isso ao medical_history. Se disser "Foi castrado semana passada", coloque "Castrado". Se não houver atualizações cadastrais, retorne {"medical_history": null, "reproductive_status": null, "coat_color": null, "behavior_tags": []}.${triageBlock}${examsBlock}

7. "suggested_routing": string com a intenção do médico para o fim da consulta. 
   Retorne "discharge" se ele disser "dar alta", "liberar paciente", "vai para casa". 
   Retorne "hospitalization" se ele disser "internar", "vai para UTI", "ficará em observação". 
   Retorne "exams" se ele disser "aguardar exames", "fazer ultrassom agora". 
   Retorne null se não houver clareza.

REGRAS ABSOLUTAS:
- Retorne SOMENTE JSON válido, sem markdown...
`

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  try {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'IA não retornou JSON válido.' }
    const parsed = JSON.parse(match[0])

    const result: VoiceExtractionResult = {
      notas_clinicas:         typeof parsed.notas_clinicas === 'string' ? parsed.notas_clinicas : '',
      medicacoes_aplicadas:   Array.isArray(parsed.medicacoes_aplicadas)
        ? parsed.medicacoes_aplicadas.map((m: any) => ({
            ...m,
            is_controlled: m.is_controlled === true,
          }))
        : [],
      documentos_sugeridos:   Array.isArray(parsed.documentos_sugeridos)
        ? parsed.documentos_sugeridos.map((d: any) => ({
            ...d,
            title:         typeof d.title   === 'string' ? d.title   : '',
            summary:       typeof d.summary === 'string' ? d.summary : '',
            is_controlled: d.is_controlled === true,
          }))
        : [],
      agendamentos_sugeridos: Array.isArray(parsed.agendamentos_sugeridos) ? parsed.agendamentos_sugeridos : [],
      vaccines_applied:       Array.isArray(parsed.vaccines_applied)       ? parsed.vaccines_applied        : [],
      pet_profile_updates:    parsed.pet_profile_updates ?? null,
      suggested_routing:      parsed.suggested_routing ?? null, // <--- ADICIONE AQUI
    }

    if (triageMerged && parsed.sinais_vitais && typeof parsed.sinais_vitais === 'object') {
      result.sinais_vitais = {
        weight:           parsed.sinais_vitais.weight           ?? null,
        temperature:      parsed.sinais_vitais.temperature      ?? null,
        heart_rate:       parsed.sinais_vitais.heart_rate       ?? null,
        respiratory_rate: parsed.sinais_vitais.respiratory_rate ?? null,
        chief_complaint:  parsed.sinais_vitais.chief_complaint  ?? null,
      }
    }

    if (examsMerged && typeof parsed.laudo_exame === 'string') {
      result.laudo_exame = parsed.laudo_exame
    }

    return result
  } catch {
    return { error: 'Erro ao interpretar resposta da IA.' }
  }
}
export async function extractHospitalizationVoice(transcript: string) {
  if (!transcript.trim()) return { error: 'Transcrição vazia.' }

  const prompt = `Você é um assistente de UTI veterinária. Analise o áudio do plantonista e extraia um JSON estrito.
  Transcrição: "${transcript}"
  
  RETORNE ESTE JSON:
  {
    "improvement_level": "melhorou" | "estavel" | "piorou",
    "notes": "Resumo clínico detalhado da evolução do paciente",
    "medications": [
      { "name": "Nome do remédio", "dose": "Dose", "route": "Via de admin", "notes": "Frequência/Obs" }
    ]
  }
  Se não falar medicação, retorne "medications": []. Inferir o improvement_level pelo tom do relato.
  Retorne SOMENTE o JSON, sem markdown nem explicações extras.`

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    
    // Extrair apenas o JSON da resposta
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'IA não retornou JSON válido.' }
    
    return JSON.parse(match[0])
  } catch (error) {
    console.error('Erro na IA da Internação:', error)
    return { error: 'Erro ao processar áudio da internação.' }
  }
}