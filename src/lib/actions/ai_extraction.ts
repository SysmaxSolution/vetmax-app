'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  buildUnifiedPrompt, normalizeUnifiedExtraction,
  type VoiceContext, type UnifiedVoiceExtraction,
} from '@/lib/voice/unified-extraction'
import { formatClinicDate, formatClinicDateTime } from '@/lib/time'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedVaccine {
  name: string
  date: string
}

export type SuggestedOutcome = 'alta' | 'exames' | 'internacao' | null

export interface ExtractedData {
  vaccines: ExtractedVaccine[]
  behavior: string[]
  suggestedOutcome: SuggestedOutcome
}

export type ClinicalRecommendation = 'alta' | 'atencao' | 'uti'

export interface ClinicalSummaryResult {
  summary:            string
  recommendation:     ClinicalRecommendation
  recommendation_label: string
  disclaimer:         string
  suggested_routing?: 'discharge' | 'hospitalization' | 'exams' | 'waiting_exam' | null
}

// ─── Extração de Transcrição (Triagem) ───────────────────────────────────────

export async function extractPatientDataFromTranscript(
  transcript: string
): Promise<ExtractedData | null> {
  if (!transcript || transcript.trim().length === 0) return null

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Você é um assistente de triagem veterinária conforme as diretrizes do CFMV. Analise o relato oral de um Auxiliar Veterinário e extraia informações clínicas estruturadas.

Relato: "${transcript}"

Responda SOMENTE com JSON válido neste formato:
{
  "vaccines": [{ "name": "string", "date": "string" }],
  "behavior": ["string"],
  "suggestedOutcome": "alta" | "exames" | "internacao" | null
}

Regras:
- vaccines: vacinas mencionadas com nome e data aproximada
- behavior: comportamentos e temperamento clinicamente relevantes do animal
- suggestedOutcome: "alta" se estável e apto, "exames" se requer exames complementares, "internacao" se requer internação, null se inconclusivo`,
      }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return null

    const json = JSON.parse(content.text.trim())
    return {
      vaccines: json.vaccines ?? [],
      behavior: json.behavior ?? [],
      suggestedOutcome: json.suggestedOutcome ?? null,
    }
  } catch (e) {
    console.error('[AI] extractPatientDataFromTranscript failed:', e)
    return null
  }
}

// ─── Extração de Motivo de Internação via Voz (G-04) ─────────────────────────

export async function extractAdmissionReason(transcript: string): Promise<string | null> {
  if (!transcript || transcript.trim().length < 5) return null

  try {
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{
        role:    'user',
        content: `Você é um assistente veterinário clínico. A partir do relato oral a seguir, extraia e resuma em 1-3 frases objetivas o MOTIVO DA INTERNAÇÃO do animal, conforme diretrizes do CFMV. Use linguagem clínica formal. Não repita o nome do animal nem do tutor.

Relato: "${transcript}"

Responda SOMENTE com o texto do motivo, sem aspas, sem prefixo, sem explicação adicional.`,
      }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return null

    const text = content.text.trim()
    return text.length > 0 ? text : null
  } catch (e) {
    console.error('[AI] extractAdmissionReason failed:', e)
    return null
  }
}

// ─── Extração Unificada de Voz Clínica (multi-domínio) ───────────────────────
//
// Schema/normalização vivem em '@/lib/voice/unified-extraction' (módulo puro,
// testável). Aqui só a server action que chama a IA.

/**
 * Extrai um ditado clínico em payload multi-domínio (5 abas da Internação ou
 * Ficha/Checklist/Relatório da Cirurgia). Determinístico no parsing: nunca
 * lança — em falha, retorna { error }.
 */
export async function extractUnifiedClinicalVoice(
  transcript: string,
  context: VoiceContext = 'hospitalization',
): Promise<UnifiedVoiceExtraction | { error: string }> {
  if (!transcript || transcript.trim().length < 2) return { error: 'Transcrição vazia.' }
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildUnifiedPrompt(transcript, context) }],
    })
    const content = message.content[0]
    if (content.type !== 'text') return { error: 'IA não retornou texto.' }
    const match = content.text.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'IA não retornou JSON válido.' }
    return normalizeUnifiedExtraction(JSON.parse(match[0]))
  } catch (e) {
    console.error('[AI] extractUnifiedClinicalVoice failed:', e)
    return { error: 'Erro ao processar o ditado clínico.' }
  }
}

// ─── Resumo de Passagem de Turno com RAG ─────────────────────────────────────

export async function generateClinicalSummary(
  hospitalizationId: string
): Promise<ClinicalSummaryResult | { error: string }> {
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

  // Buscar últimas 5 evoluções de plantão
  const { data: records, error: recErr } = await admin
    .from('hospitalization_records')
    .select('notes, improvement_level, medications, user_name, created_at')
    .eq('hospitalization_id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false })
    .limit(5)

  if (recErr) return { error: 'Erro ao buscar evoluções: ' + recErr.message }

  // Buscar documentos anexados (apenas metadados, sem conteúdo)
  const { data: docs } = await admin
    .from('hospitalization_documents')
    .select('file_name, file_type, created_at')
    .eq('hospitalization_id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false })

  // Montar contexto clínico
  const evolutionsText = (records ?? []).length > 0
    ? (records ?? []).map((r, i) => {
        const medsText = Array.isArray(r.medications) && r.medications.length > 0
          ? r.medications.map((m: any) => `${m.name} ${m.dose} ${m.route}`.trim()).join(', ')
          : 'Nenhuma medicação registrada'
        return `[Evolução ${i + 1}] ${formatClinicDateTime(r.created_at)} — ${r.user_name}
Estado clínico: ${r.improvement_level}
Observações: ${r.notes || 'Sem observações'}
Medicações aplicadas: ${medsText}`
      }).join('\n\n')
    : 'Nenhuma evolução de plantão registrada.'

  const docsText = (docs ?? []).length > 0
    ? (docs ?? []).map(d => `- ${d.file_name} (${d.file_type}) — ${formatClinicDate(d.created_at)}`).join('\n')
    : 'Nenhum documento clínico anexado.'

  const prompt = `Você é um sistema de apoio à decisão clínica veterinária, operando sob as diretrizes éticas do CFMV (Conselho Federal de Medicina Veterinária), conforme a Resolução CFMV nº 1.138/2016 (prontuários veterinários) e o Código de Ética Médico-Veterinário.

AVISO OBRIGATÓRIO: Esta análise é suporte técnico ao Médico Veterinário responsável. Não substitui a avaliação clínica presencial nem exime o MV de responsabilidade legal (CFMV, art. 8º do Código de Ética).

## Contexto Clínico — Últimas 5 Evoluções de Plantão:
${evolutionsText}

## Documentos Clínicos Anexados ao Prontuário:
${docsText}

## Instrução:
Com base exclusivamente nas evoluções registradas acima, gere:

1. RESUMO DE PASSAGEM DE TURNO no padrão SOAP veterinário (Subjetivo, Objetivo, Avaliação, Plano), máximo 4 parágrafos, linguagem técnica veterinária.

2. RECOMENDAÇÃO DE CONDUTA — escolha UMA:
   - "alta": parâmetros clínicos normalizados, animal estável, apto para alta médica com orientações ao Tutor
   - "atencao": sinais de alerta presentes, manter monitoramento contínuo na enfermaria
   - "uti": agravamento documentado, indicar transferência ou aumento de suporte intensivo

Responda SOMENTE com JSON válido, sem markdown, sem explicações externas:
{
  "summary": "texto SOAP completo",
  "recommendation": "alta" | "atencao" | "uti",
  "recommendation_label": "frase descritiva em português da conduta recomendada"
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return { error: 'Resposta inesperada da IA.' }

    // Extrai JSON mesmo se houver texto ao redor
    const match = content.text.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'Formato de resposta inválido.' }

    const json = JSON.parse(match[0])
    if (!json.summary || !json.recommendation) return { error: 'Dados insuficientes na resposta da IA.' }

    return {
      summary:              json.summary,
      recommendation:       json.recommendation as ClinicalRecommendation,
      recommendation_label: json.recommendation_label ?? '',
      disclaimer: 'Sugestão gerada por IA como apoio ao MV responsável. NÃO substitui avaliação clínica presencial (CFMV Res. 1.138/2016, art. 8º do Código de Ética MV).',
    }
  } catch (e) {
    console.error('[AI] generateClinicalSummary failed:', e)
    return { error: 'Falha ao processar análise clínica via IA.' }
  }
}

// ─── RAG Voice Chat: Perguntar ao Prontuário ──────────────────────────────────

export interface VoiceChatResult {
  answer:     string
  disclaimer: string
}

export async function askPatientHistory(
  hospitalizationId: string,
  question:          string
): Promise<VoiceChatResult | { error: string }> {
  if (!question.trim()) return { error: 'Pergunta vazia.' }

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

  // 1. Internação + dados do pet
  const { data: hosp, error: hospErr } = await admin
    .from('hospitalizations')
    .select(`status, reason, notes, created_at, patients ( name, species, breed )`)
    .eq('id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (hospErr || !hosp) return { error: 'Internação não encontrada.' }

  // 2. Todas as evoluções (até 20 mais recentes)
  const { data: records } = await admin
    .from('hospitalization_records')
    .select('notes, improvement_level, medications, user_name, created_at')
    .eq('hospitalization_id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)
    .order('created_at', { ascending: false })
    .limit(20)

  // 3. Metadados dos documentos
  const { data: docs } = await admin
    .from('hospitalization_documents')
    .select('file_name, file_type, created_at')
    .eq('hospitalization_id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)

  // 4. Prescrições ativas (Mapa de Execução)
  const { data: prescriptions } = await admin
    .from('hospitalization_prescriptions')
    .select('medication_name, dose, route, frequency_hours, duration_hours, notes, started_at')
    .eq('hospitalization_id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'active')
    .order('started_at', { ascending: false })

  // 5. Tarefas agendadas (exame/procedimento/alimentação)
  const { data: tasks } = await admin
    .from('hospitalization_tasks')
    .select('kind, description, frequency_hours, started_at')
    .eq('hospitalization_id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'active')
    .order('started_at', { ascending: false })

  // 6. Sinais vitais recentes (até 5)
  const { data: vitals } = await admin
    .from('clinical_vitals')
    .select('recorded_at, temperature, heart_rate, resp_rate, weight, blood_pressure, glucose, spo2, pain_score, notes')
    .eq('hospitalization_id', hospitalizationId)
    .eq('clinic_id', profile.clinic_id)
    .order('recorded_at', { ascending: false })
    .limit(5)

  const pet = hosp.patients as any
  const petInfo = `${pet?.name ?? 'Animal'} — ${pet?.species ?? ''}${pet?.breed ? ` (${pet.breed})` : ''}`

  const statusMap: Record<string, string> = {
    observation: 'Observação', ward: 'Enfermaria', icu: 'UTA',
    ready_for_discharge: 'Aguardando Alta', discharged: 'Alta',
  }

  const evolutionsText = (records ?? []).length > 0
    ? (records ?? []).map(r => {
        const medsText = Array.isArray(r.medications) && r.medications.length > 0
          ? r.medications.map((m: any) => `${m.name} ${m.dose} ${m.route}`.trim()).join(', ')
          : 'sem medicação'
        return `[${formatClinicDateTime(r.created_at)}] ${r.user_name} — ${r.improvement_level.toUpperCase()}
Observações: ${r.notes || 'sem observações'}
Medicações: ${medsText}`
      }).join('\n\n')
    : 'Sem evoluções registradas.'

  const docsText = (docs ?? []).length > 0
    ? (docs ?? []).map(d => `• ${d.file_name} (${d.file_type})`).join('\n')
    : 'Nenhum documento.'

  const kindLabel: Record<string, string> = { exam: 'Exame', procedure: 'Procedimento', feeding: 'Alimentação', other: 'Tarefa' }

  const prescriptionsText = (prescriptions ?? []).length > 0
    ? (prescriptions ?? []).map(p => {
        const freq = p.frequency_hours ? `${p.frequency_hours}/${p.frequency_hours}h` : 'dose única/SOS'
        const dur  = p.duration_hours ? ` por ${p.duration_hours}h` : ''
        return `• ${p.medication_name}${p.dose ? ` ${p.dose}` : ''}${p.route ? ` ${p.route}` : ''} (${freq}${dur}) — iniciada ${formatClinicDateTime(p.started_at)}${p.notes ? ` · ${p.notes}` : ''}`
      }).join('\n')
    : 'Nenhuma prescrição ativa.'

  const tasksText = (tasks ?? []).length > 0
    ? (tasks ?? []).map(t => {
        const freq = t.frequency_hours ? `${t.frequency_hours}/${t.frequency_hours}h` : 'única'
        return `• [${kindLabel[t.kind] ?? t.kind}] ${t.description} (${freq})`
      }).join('\n')
    : 'Nenhuma tarefa agendada.'

  const vitalsText = (vitals ?? []).length > 0
    ? (vitals ?? []).map(v => {
        const parts = [
          v.temperature != null ? `T ${v.temperature}°C` : null,
          v.heart_rate  != null ? `FC ${v.heart_rate}`   : null,
          v.resp_rate   != null ? `FR ${v.resp_rate}`    : null,
          v.spo2        != null ? `SpO₂ ${v.spo2}%`       : null,
          v.weight      != null ? `Peso ${v.weight}kg`    : null,
          v.blood_pressure ? `PA ${v.blood_pressure}` : null,
          v.glucose     != null ? `Glic ${v.glucose}`     : null,
          v.pain_score  != null ? `Dor ${v.pain_score}/10` : null,
        ].filter(Boolean).join(' · ')
        return `[${formatClinicDateTime(v.recorded_at)}] ${parts || '—'}${v.notes ? ` · ${v.notes}` : ''}`
      }).join('\n')
    : 'Sem aferições recentes.'

  const prompt = `Você é o Assistente Clínico do SysVetMax, apoio ao Médico Veterinário. Responda de forma concisa e objetiva em português, com linguagem técnica veterinária.

## Prontuário
**Pet:** ${petInfo}
**Motivo da internação:** ${hosp.reason ?? 'não informado'}
**Status:** ${statusMap[hosp.status] ?? hosp.status}
**Internado desde:** ${formatClinicDateTime(hosp.created_at)}
${hosp.notes ? `**Observações iniciais:** ${hosp.notes}` : ''}

## Linha do Tempo (mais recentes primeiro)
${evolutionsText}

## Prescrições Ativas (Mapa de Execução)
${prescriptionsText}

## Tarefas Agendadas
${tasksText}

## Sinais Vitais Recentes
${vitalsText}

## Documentos Anexados
${docsText}

## Pergunta do MV
"${question}"

## Instrução
Responda com base EXCLUSIVAMENTE nas informações acima — incluindo prescrições ativas, tarefas e vitais recentes quando a pergunta envolver medicação, exames, alimentação ou condição clínica atual. Se a informação não constar, diga claramente que não há registro. Máximo 3 frases. Seja direto e objetivo.

AVISO: Esta resposta é apoio técnico ao MV responsável (CFMV Res. 1.138/2016).`

  try {
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      messages:   [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return { error: 'Resposta inesperada da IA.' }

    return {
      answer:     content.text.trim(),
      disclaimer: 'Resposta gerada por IA com base no prontuário. NÃO substitui avaliação clínica presencial (CFMV Res. 1.138/2016).',
    }
  } catch (e) {
    console.error('[AI] askPatientHistory failed:', e)
    return { error: 'Falha ao consultar prontuário via IA.' }
  }
}
