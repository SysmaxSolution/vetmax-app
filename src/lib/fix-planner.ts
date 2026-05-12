import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ErrorPriority } from '@/lib/error-logger'
import { sendP0FixPlanAlert } from '@/lib/p0-alert'

/** Erros com >= N ocorrências recebem plano automático no ciclo */
export const AUTO_PLAN_THRESHOLD = 5

export interface ErrorCluster {
  fingerprint:     string
  priority:        ErrorPriority
  module:          string | null
  path:            string
  errorMessage:    string
  stackTrace:      string | null
  occurrenceCount: number
  affectedLogIds:  string[]
  firstSeen:       string
  lastSeen:        string
}

export interface GeneratePlanResult {
  planId:  string
  title:   string
  status: 'created' | 'skipped_existing'
}

export interface AutoFixCycleResult {
  created: number
  skipped: number
  failed:  number
  clusters: number
}

// ─── Prompt de Engenharia ──────────────────────────────────────────────────────

const PLANNER_SYSTEM = `Você é um Engenheiro de Software Sênior especializado em Next.js 16 App Router, TypeScript 5, React 19, Supabase PostgreSQL e autenticação @supabase/ssr.

Você analisa erros de produção do SysVetMax — SaaS veterinário multi-tenant (isolamento por clinic_id + RLS) — e gera planos técnicos precisos, acionáveis e seguros para produção.

STACK DO PROJETO:
- Framework: Next.js 16 App Router (Server Actions, Route Handlers, Edge Middleware)
- UI: React 19 + Tailwind CSS v4
- Banco: Supabase PostgreSQL — RLS em todas as tabelas, clinic_id obrigatório
- Auth: @supabase/ssr com refresh via middleware
- IA: Anthropic SDK (Haiku para classificação, Sonnet para planos)
- WhatsApp: Evolution API v2 (self-hosted)
- Testes: Playwright E2E + Jest Unit

REGRAS DO PLANO:
1. Título: ≤ 80 chars, começa com verbo imperativo (Corrigir, Adicionar, Validar, Proteger...)
2. Diagnóstico: sintoma exato, qual fluxo do usuário é afetado, impacto clínico
3. Causa Raiz: identifica arquivo:linha quando possível pelo stack trace
4. Arquivos Afetados: caminhos src/ exatos
5. Plano de Correção: passos numerados com trechos TypeScript/SQL quando relevante. Não altere outras funcionalidades.
6. Comandos de Teste: comandos exatos para validar o fix

Responda APENAS com JSON válido sem markdown externo:
{
  "title": "Título conciso",
  "description_md": "# Título\\n\\n## Diagnóstico\\n...\\n\\n## Causa Raiz\\n...\\n\\n## Arquivos Afetados\\n- \`src/...\`\\n\\n## Plano de Correção\\n1. ...\\n\\n## Comandos de Teste\\n\`\`\`bash\\nnpx playwright test ...\\n\`\`\`",
  "claude_analysis": {
    "root_cause": "Descrição técnica em 1 parágrafo",
    "affected_files": ["src/path/to/file.ts"],
    "fix_type": "null_check | type_error | auth_fix | db_fix | rls_fix | config_fix | validation | missing_await",
    "estimated_complexity": "low | medium | high",
    "test_commands": ["npx playwright test --grep 'nomeDoMódulo'"]
  }
}`

const client = new Anthropic()

// ─── Clusterização ─────────────────────────────────────────────────────────────

/**
 * Busca error_logs não resolvidos e sem plano vinculado,
 * agrupa por fingerprint e retorna clusters ordenados por prioridade.
 */
export async function clusterizeErrors(opts?: {
  fingerprints?:   string[]
  minOccurrences?: number
}): Promise<ErrorCluster[]> {
  const admin     = createAdminClient()
  const threshold = opts?.minOccurrences ?? AUTO_PLAN_THRESHOLD

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = admin
    .from('error_logs')
    .select('id, fingerprint, priority, module, path, error_message, stack_trace, occurrence_count, created_at')
    .eq('resolved', false)
    .is('fix_plan_id', null)
    .not('fingerprint', 'is', null)
    .order('occurrence_count', { ascending: false })
    .limit(300)

  if (opts?.fingerprints?.length) {
    query = query.in('fingerprint', opts.fingerprints)
  } else {
    // P0 entra sempre; demais só se atingiram o threshold
    query = query.or(`occurrence_count.gte.${threshold},priority.eq.P0`)
  }

  const { data, error } = await query
  if (error || !data) {
    console.error('[fix-planner] Erro ao buscar clusters:', error?.message)
    return []
  }

  // Agrega por fingerprint em memória
  const map = new Map<string, ErrorCluster>()

  for (const row of data as Array<{
    id: string
    fingerprint: string
    priority: string | null
    module: string | null
    path: string
    error_message: string
    stack_trace: string | null
    occurrence_count: number
    created_at: string
  }>) {
    if (!row.fingerprint) continue
    const existing = map.get(row.fingerprint)

    if (!existing) {
      map.set(row.fingerprint, {
        fingerprint:     row.fingerprint,
        priority:        (row.priority ?? 'P1') as ErrorPriority,
        module:          row.module,
        path:            row.path,
        errorMessage:    row.error_message,
        stackTrace:      row.stack_trace ?? null,
        occurrenceCount: row.occurrence_count ?? 1,
        affectedLogIds:  [row.id],
        firstSeen:       row.created_at,
        lastSeen:        row.created_at,
      })
    } else {
      existing.affectedLogIds.push(row.id)
      if (row.created_at < existing.firstSeen) existing.firstSeen = row.created_at
      if (row.created_at > existing.lastSeen)  existing.lastSeen  = row.created_at
      // Prefere o stack trace mais completo
      if (!existing.stackTrace && row.stack_trace) existing.stackTrace = row.stack_trace
    }
  }

  return Array.from(map.values())
}

// ─── Geração de Plano ──────────────────────────────────────────────────────────

/**
 * Gera um plano de correção para um cluster de erros via Claude Sonnet.
 * Idempotente: se já existe plano pendente/aprovado para o fingerprint, retorna o existente.
 */
export async function generateFixPlanForCluster(
  cluster: ErrorCluster
): Promise<GeneratePlanResult | null> {
  const admin = createAdminClient()

  // Idempotência: não duplica plano para o mesmo fingerprint em estado ativo
  const { data: existing } = await admin
    .from('fix_plans')
    .select('id, title')
    .contains('affected_fingerprints', [cluster.fingerprint])
    .in('status', ['draft', 'pending_approval', 'approved', 'in_progress'])
    .maybeSingle()

  if (existing) {
    console.info(`[fix-planner] Plano já existe para fingerprint ${cluster.fingerprint} → id=${existing.id}`)
    return { planId: existing.id, title: existing.title, status: 'skipped_existing' }
  }

  // Monta contexto rico para o Claude
  const stackSection = cluster.stackTrace
    ? `\n## Stack Trace\n\`\`\`\n${cluster.stackTrace.split('\n').slice(0, 25).join('\n')}\n\`\`\``
    : '\n_Stack trace não disponível para este erro._'

  const userPrompt = `## Cluster de Erro — Fingerprint: \`${cluster.fingerprint}\`

| Campo | Valor |
|-------|-------|
| **Prioridade** | ${cluster.priority} |
| **Módulo** | ${cluster.module ?? 'desconhecido'} |
| **Rota** | \`${cluster.path}\` |
| **Ocorrências** | ${cluster.occurrenceCount} |
| **Primeira ocorrência** | ${cluster.firstSeen} |
| **Última ocorrência** | ${cluster.lastSeen} |

## Mensagem de Erro
\`\`\`
${cluster.errorMessage.slice(0, 1000)}
\`\`\`
${stackSection}

## IDs dos Logs Afetados (${cluster.affectedLogIds.length} total)
\`${cluster.affectedLogIds.slice(0, 8).join('`, `')}\`

---
Gere o plano técnico de correção completo para este erro de produção.`

  let planData: {
    title: string
    description_md: string
    claude_analysis: {
      root_cause: string
      affected_files: string[]
      fix_type: string
      estimated_complexity: string
      test_commands: string[]
    }
  }

  try {
    const response = await client.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:   3000,
      system:       PLANNER_SYSTEM,
      messages:    [{ role: 'user', content: userPrompt }],
    })

    const raw   = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    // Extrai o objeto JSON — robusto contra texto anterior/posterior ao JSON
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`Claude retornou conteúdo sem JSON: ${raw.slice(0, 200)}`)

    planData = JSON.parse(match[0])

    if (!planData.title || !planData.description_md) {
      throw new Error('Campos obrigatórios ausentes no JSON retornado')
    }
  } catch (err) {
    console.error(`[fix-planner] Falha ao gerar plano para ${cluster.fingerprint}:`, err)
    return null
  }

  // Persiste o plano na tabela fix_plans
  const { data: inserted, error: insertErr } = await admin
    .from('fix_plans')
    .insert({
      title:                 planData.title.slice(0, 120),
      priority:              cluster.priority,
      status:                'pending_approval',
      affected_modules:      cluster.module ? [cluster.module] : [],
      affected_fingerprints: [cluster.fingerprint],
      error_summary: `${cluster.errorMessage.slice(0, 300)} — ${cluster.occurrenceCount} ocorrência(s) entre ${cluster.firstSeen.slice(0, 10)} e ${cluster.lastSeen.slice(0, 10)}`,
      description_md:        planData.description_md,
      claude_analysis:       planData.claude_analysis,
    })
    .select('id, title')
    .single()

  if (insertErr || !inserted) {
    console.error('[fix-planner] Falha ao inserir plano:', insertErr?.message)
    return null
  }

  // Vincula os error_logs ao plano para rastreabilidade
  if (cluster.affectedLogIds.length > 0) {
    const { error: linkErr } = await admin
      .from('error_logs')
      .update({ fix_plan_id: inserted.id })
      .in('id', cluster.affectedLogIds)

    if (linkErr) {
      console.warn('[fix-planner] Falha ao vincular logs ao plano:', linkErr.message)
    }
  }

  console.info(`[fix-planner] ✅ Plano criado — "${inserted.title}" (${cluster.priority}) id=${inserted.id} logs=${cluster.affectedLogIds.length}`)

  // Notifica o Diretor via WhatsApp para aprovação bidirecional
  await sendP0FixPlanAlert({
    fixPlanId:    inserted.id,
    fixPlanTitle: inserted.title,
    errorSummary: `${cluster.errorMessage.slice(0, 280)} — ${cluster.occurrenceCount} ocorrência(s)`,
    priority:     cluster.priority,
  })

  return { planId: inserted.id, title: inserted.title, status: 'created' }
}

// ─── Ciclo Automático ──────────────────────────────────────────────────────────

/**
 * Orquestra o ciclo completo: clusteriza → filtra não planejados → gera planos.
 * P0 sempre processado primeiro. Limita por maxClusters para controlar custo de API.
 */
export async function runAutoFixCycle(opts?: {
  maxClusters?:    number
  minOccurrences?: number
  fingerprints?:   string[]
}): Promise<AutoFixCycleResult> {
  const maxClusters = opts?.maxClusters ?? 5

  const clusters = await clusterizeErrors({
    fingerprints:   opts?.fingerprints,
    minOccurrences: opts?.minOccurrences,
  })

  if (!clusters.length) {
    return { created: 0, skipped: 0, failed: 0, clusters: 0 }
  }

  // P0 primeiro, depois P1, depois P2; dentro de cada prioridade: mais ocorrências primeiro
  const priorityOrder: Record<ErrorPriority, number> = { P0: 0, P1: 1, P2: 2 }
  const sorted = [...clusters].sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority]
    return pd !== 0 ? pd : b.occurrenceCount - a.occurrenceCount
  })

  let created = 0, skipped = 0, failed = 0

  for (const cluster of sorted.slice(0, maxClusters)) {
    const result = await generateFixPlanForCluster(cluster)
    if (!result)                            failed++
    else if (result.status === 'created')   created++
    else                                    skipped++
  }

  console.info(`[fix-planner] Ciclo — clusters=${clusters.length} processados=${Math.min(clusters.length, maxClusters)} criados=${created} existentes=${skipped} falhas=${failed}`)
  return { created, skipped, failed, clusters: clusters.length }
}
