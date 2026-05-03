'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditSuggestion = {
  procedure:  string
  issue:      string
  suggestion: string
  template:   string | null
  severity:   'blocking' | 'warning' | 'info'
}

export type AuditResult = {
  result:       'approved' | 'warnings' | 'issues_found'
  suggestions:  AuditSuggestion[]
  providerId:   string
  providerName: string
  insuranceId:  string
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runInsuranceAudit(params: {
  consultationId: string
  patientId:      string
  vetNotes:       string
  examOrders?:    string
}): Promise<AuditResult | null> {
  const { consultationId, patientId, vetNotes, examOrders } = params

  if (!vetNotes.trim()) return null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles').select('clinic_id').eq('id', user.id).single()
    if (!profile?.clinic_id) return null

    // 1. Buscar convênio ativo do pet
    const { data: ins } = await supabase
      .from('pet_insurance')
      .select(`
        id, provider_id, plan_type, member_id, coverage_status,
        insurance_providers ( id, name )
      `)
      .eq('patient_id', patientId)
      .eq('clinic_id', profile.clinic_id)
      .eq('coverage_status', 'active')
      .maybeSingle()

    if (!ins) return null

    const provider = ins.insurance_providers as any
    if (!provider) return null

    // 2. Buscar regras ativas do convênio
    const { data: rules } = await supabase
      .from('insurance_rules')
      .select('procedure_name, rule_type, rule_description, justification_template, severity')
      .eq('provider_id', ins.provider_id)
      .eq('clinic_id', profile.clinic_id)
      .eq('is_active', true)

    if (!rules || rules.length === 0) return null

    // 3. Chamar Claude Haiku para analisar prontuário vs. regras
    const rulesText = rules.map(r =>
      `- Procedimento: "${r.procedure_name}" | Tipo: ${r.rule_type} | Severidade: ${r.severity} | Regra: ${r.rule_description}${r.justification_template ? ` | Template: "${r.justification_template}"` : ''}`
    ).join('\n')

    const prompt = `Você é um auditor especialista em convênios de saúde pet no Brasil.

CONVÊNIO: ${provider.name} — Plano: ${ins.plan_type}

REGRAS DE GLOSA ATIVAS:
${rulesText}

PRONTUÁRIO DO MÉDICO VETERINÁRIO:
${vetNotes}
${examOrders ? `\nPEDIDOS DE EXAME:\n${examOrders}` : ''}

TAREFA: Analise o prontuário e identifique possíveis glosas com base nas regras acima.

RETORNE APENAS este JSON (sem markdown):
{
  "result": "approved" | "warnings" | "issues_found",
  "suggestions": [
    {
      "procedure": "nome do procedimento identificado",
      "issue": "descrição do problema de glosa",
      "suggestion": "o que o MV deve fazer para evitar a glosa",
      "template": "texto do template de justificativa ou null",
      "severity": "blocking" | "warning" | "info"
    }
  ]
}

Regras:
- "approved": nenhuma inconsistência encontrada
- "warnings": há avisos mas não são bloqueantes
- "issues_found": há pelo menos uma regra blocking violada
- Só inclua suggestions para procedimentos MENCIONADOS no prontuário que violem as regras
- Se nenhuma regra for violada, retorne approved com suggestions: []`

    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const match   = rawText.match(/\{[\s\S]*\}/)
    if (!match) return null

    const parsed: { result: AuditResult['result']; suggestions: AuditSuggestion[] } = JSON.parse(match[0])

    const auditResult: AuditResult = {
      result:       parsed.result,
      suggestions:  Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      providerId:   ins.provider_id,
      providerName: provider.name,
      insuranceId:  ins.id,
    }

    // 4. Salvar log de auditoria (fire-and-forget errors)
    try {
      const admin = createAdminClient()
      await admin.from('insurance_audit_log').insert({
        clinic_id:       profile.clinic_id,
        consultation_id: consultationId,
        patient_id:      patientId,
        provider_id:     ins.provider_id,
        audit_result:    auditResult.result,
        ai_suggestions:  auditResult.suggestions,
        vet_acknowledged: false,
      })

      // Vincular insurance_id na consulta
      await admin
        .from('consultations')
        .update({
          insurance_id:           ins.id,
          insurance_verified_at:  new Date().toISOString(),
        })
        .eq('id', consultationId)
    } catch { /* log silencioso — não quebra o fluxo */ }

    return auditResult
  } catch (err) {
    console.error('[InsuranceAudit] Erro:', err)
    return null
  }
}

// ─── Aceitar override do MV (com justificativa) ───────────────────────────────

export async function acknowledgeInsuranceAudit(params: {
  consultationId:  string
  overrideReason?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Não autenticado.' }

    const admin = createAdminClient()

    // Marcar o último log como acknowledged
    const { data: log } = await admin
      .from('insurance_audit_log')
      .select('id')
      .eq('consultation_id', params.consultationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (log) {
      await admin
        .from('insurance_audit_log')
        .update({ vet_acknowledged: true, vet_override_reason: params.overrideReason ?? null })
        .eq('id', log.id)
    }

    if (params.overrideReason) {
      await admin
        .from('consultations')
        .update({ insurance_override_reason: params.overrideReason })
        .eq('id', params.consultationId)
    }

    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

// ─── Buscar último audit log de uma consulta ──────────────────────────────────

export async function getConsultationAuditLog(consultationId: string): Promise<{
  audit_result:     string
  ai_suggestions:   AuditSuggestion[]
  vet_acknowledged: boolean
  created_at:       string
  provider_name:    string
} | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
      .from('insurance_audit_log')
      .select(`
        audit_result, ai_suggestions, vet_acknowledged, created_at,
        insurance_providers ( name )
      `)
      .eq('consultation_id', consultationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return null

    return {
      audit_result:     data.audit_result,
      ai_suggestions:   Array.isArray(data.ai_suggestions) ? data.ai_suggestions as AuditSuggestion[] : [],
      vet_acknowledged: data.vet_acknowledged,
      created_at:       data.created_at,
      provider_name:    (data.insurance_providers as any)?.name ?? '',
    }
  } catch {
    return null
  }
}
