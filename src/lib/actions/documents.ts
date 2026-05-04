'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { VitalSigns, ExtractedField } from '@/types'
import { SYSTEM_TEMPLATES, isSystemTemplate } from '@/lib/system-templates'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PatientDocument = {
  id: string
  template_id: string | null
  template_name: string | null
  template_type: string | null
  template_extracted_fields: ExtractedField[] | null
  template_html: string | null
  page_images: string[] | null
  document_name: string
  content_data: Record<string, any>
  created_at: string
  template?: { name: string; type: string } | null
}


// ─── Listar Documentos da Consulta ───────────────────────────────────────────

export async function getPatientDocuments(
  consultationId: string
): Promise<PatientDocument[] | { error: string }> {
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
    .from('patient_documents')
    .select('id, template_id, template_name, template_type, template_extracted_fields, template_html, page_images, document_name, content_data, created_at, document_templates(name, type)')
    .eq('consultation_id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar documentos: ' + error.message }

  return (data ?? []).map((d: any) => ({
    id:                          d.id,
    template_id:                 d.template_id,
    template_name:               d.template_name,
    template_type:               d.template_type,
    template_extracted_fields:   d.template_extracted_fields ?? null,
    template_html:               d.template_html ?? null,
    page_images:                 d.page_images ?? null,
    document_name:               d.document_name,
    content_data:                d.content_data ?? {},
    created_at:                  d.created_at,
    template: d.document_templates
      ? { name: d.document_templates.name, type: d.document_templates.type }
      : null,
  }))
}

// ─── Gerar Rascunho via IA ────────────────────────────────────────────────────

export async function generateDocumentDraft(
  templateId: string,
  consultationId: string,
  hint?: string  // contexto extra (ex: motivo sugerido pela voz)
): Promise<{
  fields: Record<string, any>
  template_name: string
  template_type: string
  extracted_fields: ExtractedField[]
  is_system_template: boolean
} | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  // 1. Resolve template (DB ou sistema)
  let templateName: string
  let templateType: string
  let fields: ExtractedField[]
  const isSysTemplate = isSystemTemplate(templateId)

  if (isSysTemplate) {
    const sysTemplate = SYSTEM_TEMPLATES.find(t => t.id === templateId)
    if (!sysTemplate) return { error: 'Template de sistema não encontrado.' }
    templateName = sysTemplate.name
    templateType = sysTemplate.type
    fields       = sysTemplate.extracted_fields
  } else {
    const { data: template, error: tErr } = await supabase
      .from('document_templates')
      .select('id, name, type, extracted_fields')
      .eq('id', templateId)
      .eq('clinic_id', profile.clinic_id)
      .single()

    if (tErr || !template) return { error: 'Template não encontrado.' }
    templateName = template.name
    templateType = template.type
    fields       = template.extracted_fields as ExtractedField[]
  }

  if (!fields?.length) return { error: 'Template sem campos configurados.' }

  // 2. Busca contexto completo da consulta
  const admin = createAdminClient()

  const { data: consult, error: cErr } = await admin
    .from('consultations')
    .select('id, visit_reason, weight, temperature, triage_notes, vet_notes, audio_transcript, patient_id')
    .eq('id', consultationId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (cErr || !consult) return { error: 'Consulta não encontrada.' }

  const { data: patient } = await admin
    .from('patients')
    .select('name, species, breed, gender, color, birth_date, neutered, allergies, chronic_diseases, past_surgeries, tutor_id')
    .eq('id', consult.patient_id)
    .eq('clinic_id', profile.clinic_id)
    .single()

  const { data: tutor } = patient?.tutor_id
    ? await admin.from('tutors').select('name, cpf, phone').eq('id', patient.tutor_id).eq('clinic_id', profile.clinic_id).single()
    : { data: null }

  // 3. Reconstrói sinais vitais dos campos legados
  let vitals: Partial<VitalSigns> = {}
  if (consult.weight || consult.temperature || consult.triage_notes) {
    try { vitals = JSON.parse(consult.triage_notes ?? '') } catch { /* texto livre */ }
    vitals.weight = consult.weight ?? vitals.weight
    vitals.temperature = consult.temperature ?? vitals.temperature
  }

  // 4. Calcula idade
  const age = patient?.birth_date
    ? (() => {
        const months = Math.floor(
          (Date.now() - new Date(patient.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 30.5)
        )
        return months < 12 ? `${months} meses` : `${Math.floor(months / 12)} anos`
      })()
    : 'Não informada'

  // 5. Monta pacote de contexto para a IA
  const context = [
    `DADOS DO ATENDIMENTO:`,
    `Pet: ${patient?.name ?? 'N/I'} | Espécie: ${patient?.species ?? 'N/I'} | Raça: ${patient?.breed ?? 'N/I'}`,
    `Sexo: ${patient?.gender ?? 'N/I'} | Idade: ${age} | Pelagem: ${patient?.color ?? 'N/I'} | Castrado: ${patient?.neutered ? 'Sim' : 'Não'}`,
    `Alergias: ${patient?.allergies ?? 'Nenhuma conhecida'}`,
    `Doenças crônicas: ${patient?.chronic_diseases ?? 'Nenhuma'}`,
    `Cirurgias anteriores: ${patient?.past_surgeries ?? 'Nenhuma'}`,
    ``,
    `Tutor: ${tutor?.name ?? 'N/I'} | CPF: ${tutor?.cpf ?? 'N/I'} | Tel: ${tutor?.phone ?? 'N/I'}`,
    ``,
    `SINAIS VITAIS (Triagem):`,
    `Peso: ${vitals.weight ?? 'N/I'} kg | Temp. Retal: ${vitals.temperature ?? 'N/I'}°C`,
    `FC: ${vitals.heart_rate ?? 'N/I'} bpm | FR: ${vitals.respiratory_rate ?? 'N/I'} mov/min`,
    `Mucosas: ${vitals.mucous_color ?? 'N/I'} | TRC: ${vitals.crt ?? 'N/I'}`,
    `Queixa Principal: ${vitals.chief_complaint ?? 'N/I'}`,
    ``,
    `NOTAS DO VETERINÁRIO:`,
    consult.vet_notes || 'Não registradas',
    ``,
    `TRANSCRIÇÃO DE VOZ:`,
    consult.audio_transcript || 'Não disponível',
  ].join('\n')

  const fieldsDesc = fields
    .map(f => `- ${f.field_name} (${f.label}, tipo: ${f.type}): ${f.description}`)
    .join('\n')

  const hintSection = hint ? `\nCONTEXTO ADICIONAL (sugestão de voz):\n"${hint}"\nUse este contexto para preencher os campos de forma mais precisa.\n` : ''

  const prompt = `Você é um assistente de documentação clínica veterinária. Preencha os campos do template abaixo com base nos dados do atendimento.

${context}
${hintSection}
CAMPOS DO TEMPLATE "${templateName}" (tipo: ${templateType}):
${fieldsDesc}

REGRAS ABSOLUTAS:
1. Retorne APENAS um objeto JSON válido, sem markdown, sem texto extra
2. Use os field_names exatos como chaves
3. Preencha SOMENTE campos onde há informação disponível nos dados acima
4. Para campos sem informação, use null — NUNCA invente dados clínicos
5. Datas em formato DD/MM/AAAA
6. Números sem unidades de medida (ex: 12.5 não "12.5 kg")
7. Texto em PT-BR formal e objetivo

Responda SOMENTE com o JSON:`

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  let aiFields: Record<string, any> = {}
  try {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (match) aiFields = JSON.parse(match[0])
  } catch {
    return { error: 'IA não conseguiu preencher os campos. Verifique o template e tente novamente.' }
  }

  // Remove campos com null/undefined para facilitar detecção de "vazio" no frontend
  const cleanedFields: Record<string, any> = {}
  for (const [k, v] of Object.entries(aiFields)) {
    if (v !== null && v !== undefined) cleanedFields[k] = v
  }

  return {
    fields:             cleanedFields,
    template_name:      templateName,
    template_type:      templateType,
    extracted_fields:   fields,
    is_system_template: isSysTemplate,
  }
}

// ─── Salvar Documento ─────────────────────────────────────────────────────────

export async function savePatientDocument(data: {
  consultation_id: string
  patient_id: string
  template_id: string | null
  template_name: string
  template_type: string
  template_extracted_fields: ExtractedField[]
  template_html?: string | null
  page_images?: string[] | null
  document_name: string
  content_data: Record<string, any>
}): Promise<{ id: string } | { error: string }> {
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
    .from('patient_documents')
    .insert({
      clinic_id:                   profile.clinic_id,
      patient_id:                  data.patient_id,
      consultation_id:             data.consultation_id,
      template_id:                 data.template_id,
      template_name:               data.template_name,
      template_type:               data.template_type,
      template_extracted_fields:   data.template_extracted_fields,
      template_html:               data.template_html || null,
      page_images:                 data.page_images || null,
      document_name:               data.document_name,
      content_data:                data.content_data,
    })
    .select('id')
    .single()

  if (error || !result) {
    return { error: 'Erro ao salvar documento: ' + (error?.message ?? '') }
  }

  revalidatePath(`/dashboard/vet/${data.consultation_id}`)
  return { id: result.id }
}

// ─── Atualizar Documento ──────────────────────────────────────────────────────

export async function updatePatientDocument(
  id: string,
  content_data: Record<string, any>,
  consultationId: string,
): Promise<{ id: string } | { error: string }> {
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
    .from('patient_documents')
    .update({ content_data })
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)
    .select('id')
    .single()

  if (error || !result) {
    return { error: 'Erro ao atualizar documento: ' + (error?.message ?? '') }
  }

  revalidatePath(`/dashboard/vet/${consultationId}`)
  return { id: result.id }
}
