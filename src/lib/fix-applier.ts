/**
 * fix-applier — Aplica planos de correção (fix_plans) aprovados em background.
 *
 * Fluxo:
 *   1. Lê plano com status='approved'
 *   2. Marca status='in_progress'
 *   3. Chama Claude Sonnet pedindo patches em JSON estruturado
 *   4. Persiste patches em fix_plans.claude_analysis.patches (auditoria)
 *   5. Tenta aplicar localmente via git (quando processo tem acesso ao repo)
 *      - cria branch fix/<slug>-<id8>
 *      - escreve arquivos
 *      - git add + commit
 *      - se gh CLI disponível: push + abre PR; senão deixa branch local
 *   6. Atualiza status:
 *      - 'pr_opened' com pr_url quando PR criado
 *      - 'completed' quando aplicado sem PR (modo local-only)
 *      - 'fix_failed' com erro em test_results.error caso falhe
 *
 * Modo Vercel/Serverless: aplica patches gera apenas o JSON (sem git). Runner
 * externo (Mozart Routine via /api/cron/apply-approved-fixes) executa o resto.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { execFile as _execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(_execFile)

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FixPlanRow {
  id:                string
  title:             string
  priority:          'P0' | 'P1' | 'P2'
  status:            string
  description_md:    string | null
  error_summary:     string | null
  affected_modules:  string[]
  claude_analysis:   Record<string, unknown> | null
  branch_name:       string | null
  pr_url:            string | null
}

export interface AppliedPatch {
  file_path:   string
  new_content: string
  reason:      string
}

export interface ApplyResult {
  planId:       string
  status:       'pr_opened' | 'completed' | 'fix_failed' | 'in_progress_patches_ready'
  patches:      AppliedPatch[]
  branch_name?: string
  pr_url?:      string
  error?:       string
  test_output?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which'
    await execFile(probe, [cmd])
    return true
  } catch {
    return false
  }
}

function getRepoRoot(): string {
  // O processo Next.js roda a partir da raiz do repo em produção.
  // Permite override via FIX_APPLIER_REPO_ROOT para ambientes alternativos.
  return process.env.FIX_APPLIER_REPO_ROOT ?? process.cwd()
}

// ─── Geração dos patches via Claude ───────────────────────────────────────────

const APPLIER_SYSTEM = `Você é um Engenheiro de Software Sênior aplicando uma correção em código de produção no SysVetMax (Next.js 16 + React 19 + TypeScript + Supabase).

Recebe um plano de correção (já aprovado por humanos) e o conteúdo atual dos arquivos afetados. Sua tarefa é gerar o conteúdo FINAL completo de cada arquivo a ser modificado.

REGRAS CRÍTICAS:
1. NÃO crie arquivos novos a menos que o plano explicitamente requira
2. Preserve TODA a estrutura existente que NÃO precisa mudar
3. NÃO remova imports, exports, types, ou funções não relacionadas ao fix
4. Mantenha o estilo de código atual (indentação, aspas, ponto-vírgula)
5. NÃO adicione console.log ou debugging code
6. NÃO altere migrations já aplicadas — se precisar mudar schema, crie nova migration
7. Comentários em PT-BR, código em inglês quando convencional (variáveis, funções)

Responda APENAS com JSON válido (sem markdown):
{
  "patches": [
    {
      "file_path": "src/path/to/file.ts",
      "new_content": "<conteúdo completo do arquivo após o fix>",
      "reason": "breve descrição do que mudou (1 linha)"
    }
  ],
  "commit_message": "fix(<modulo>): <descrição curta>\\n\\n<corpo opcional explicando o porquê>"
}

Se não conseguir aplicar com segurança (informação insuficiente, risco de regressão), retorne:
{
  "patches": [],
  "commit_message": "",
  "blocked_reason": "<por que não pode aplicar>"
}`

interface ClaudePatchResponse {
  patches:        AppliedPatch[]
  commit_message: string
  blocked_reason?: string
}

async function generatePatchesViaClaude(
  plan: FixPlanRow,
  fileContents: Record<string, string>,
): Promise<ClaudePatchResponse> {
  const client = new Anthropic()

  const filesBlock = Object.entries(fileContents)
    .map(([p, c]) => `### Arquivo: ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join('\n\n')

  const userPrompt = [
    `# Plano de correção aprovado (id=${plan.id.slice(0, 8)})\n`,
    `**Prioridade:** ${plan.priority}`,
    `**Título:** ${plan.title}\n`,
    `**Resumo do erro:**\n${plan.error_summary ?? '(não informado)'}\n`,
    `**Descrição detalhada:**\n${plan.description_md ?? '(não informada)'}\n`,
    `\n# Conteúdo atual dos arquivos afetados\n\n${filesBlock}\n`,
    `\nGere os patches no JSON estruturado conforme system prompt.`,
  ].join('\n')

  const resp = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 8000,
    system:     APPLIER_SYSTEM,
    messages:   [{ role: 'user', content: userPrompt }],
  })

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  if (!text) throw new Error('Claude retornou resposta vazia')

  // Tolerante a wrapper markdown ```json ... ```
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Resposta sem JSON: ' + text.slice(0, 200))

  try {
    return JSON.parse(jsonMatch[0]) as ClaudePatchResponse
  } catch (e) {
    throw new Error('JSON inválido do Claude: ' + (e as Error).message)
  }
}

// ─── Leitura segura dos arquivos afetados ────────────────────────────────────

async function readAffectedFiles(
  affectedPaths: string[],
): Promise<Record<string, string>> {
  const repoRoot = getRepoRoot()
  const result:   Record<string, string> = {}

  for (const rel of affectedPaths.slice(0, 8)) { // teto de segurança
    // Bloqueia path traversal e paths absolutos
    if (rel.includes('..') || path.isAbsolute(rel)) continue
    // Só lê dentro de src/, supabase/migrations/, scripts/
    if (!/^(src|supabase[/\\]migrations|scripts)[/\\]/.test(rel)) continue

    const abs = path.join(repoRoot, rel)
    try {
      const stat = await fs.stat(abs)
      if (!stat.isFile() || stat.size > 200_000) continue
      result[rel] = await fs.readFile(abs, 'utf-8')
    } catch {
      // Arquivo não existe — Claude pode criar novo
      result[rel] = '<<arquivo ainda não existe — criar se necessário>>'
    }
  }
  return result
}

// ─── Aplicação no FS + git ────────────────────────────────────────────────────

async function applyPatchesToFs(
  patches: AppliedPatch[],
): Promise<{ writtenPaths: string[]; errors: string[] }> {
  const repoRoot = getRepoRoot()
  const writtenPaths: string[] = []
  const errors:       string[] = []

  for (const p of patches) {
    if (!/^(src|supabase[/\\]migrations|scripts)[/\\]/.test(p.file_path)) {
      errors.push(`bloqueado fora de paths permitidos: ${p.file_path}`)
      continue
    }
    if (p.file_path.includes('..')) {
      errors.push(`path traversal bloqueado: ${p.file_path}`)
      continue
    }
    const abs = path.join(repoRoot, p.file_path)
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, p.new_content, 'utf-8')
      writtenPaths.push(p.file_path)
    } catch (e) {
      errors.push(`${p.file_path}: ${(e as Error).message}`)
    }
  }
  return { writtenPaths, errors }
}

async function gitCommitAndPush(
  branchName: string,
  commitMessage: string,
  paths: string[],
): Promise<{ pushed: boolean; prUrl?: string; localOnly: boolean; error?: string }> {
  const repoRoot = getRepoRoot()
  const hasGit   = await commandExists('git')
  if (!hasGit) {
    return { pushed: false, localOnly: true, error: 'git CLI indisponível' }
  }

  const opts = { cwd: repoRoot, timeout: 60_000 }

  try {
    // Verifica se está num repo git válido
    await execFile('git', ['rev-parse', '--git-dir'], opts)

    // Cria branch a partir do head atual
    await execFile('git', ['checkout', '-b', branchName], opts).catch(async () => {
      // Branch já existe — checkout
      await execFile('git', ['checkout', branchName], opts)
    })

    // Add apenas os arquivos modificados (não usar -A para evitar lixo)
    for (const p of paths) {
      await execFile('git', ['add', '--', p], opts)
    }

    // Verifica se há mudanças staged
    const { stdout: diffStat } = await execFile('git', ['diff', '--staged', '--name-only'], opts)
    if (!diffStat.trim()) {
      return { pushed: false, localOnly: true, error: 'Nada para commitar (patches não geraram diff)' }
    }

    await execFile('git', ['commit', '-m', commitMessage], opts)

    // Tenta push + PR via gh
    const hasGh = await commandExists('gh')
    if (!hasGh) {
      return { pushed: false, localOnly: true }
    }

    try {
      await execFile('git', ['push', '-u', 'origin', branchName], opts)
    } catch (e) {
      return { pushed: false, localOnly: true, error: 'git push falhou: ' + (e as Error).message }
    }

    try {
      const { stdout } = await execFile(
        'gh',
        [
          'pr', 'create',
          '--title', commitMessage.split('\n')[0],
          '--body',  `Plano aplicado automaticamente pelo Monitor de Erros (fix-applier).\n\n${commitMessage}`,
          '--head',  branchName,
        ],
        opts,
      )
      const urlMatch = stdout.match(/https:\/\/[^\s]+/)
      return { pushed: true, prUrl: urlMatch?.[0], localOnly: false }
    } catch (e) {
      return { pushed: true, localOnly: false, error: 'gh pr create falhou: ' + (e as Error).message }
    }
  } catch (e) {
    return { pushed: false, localOnly: true, error: (e as Error).message }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function applyApprovedFixPlan(
  planId: string,
  opts?: { dryRun?: boolean },
): Promise<ApplyResult> {
  const admin = createAdminClient()

  const { data: plan, error: readErr } = await admin
    .from('fix_plans')
    .select('id, title, priority, status, description_md, error_summary, affected_modules, claude_analysis, branch_name, pr_url')
    .eq('id', planId)
    .maybeSingle()

  if (readErr || !plan) {
    return { planId, status: 'fix_failed', patches: [], error: `Plano não encontrado: ${readErr?.message ?? 'n/a'}` }
  }

  if (plan.status !== 'approved') {
    return { planId, status: 'fix_failed', patches: [], error: `Plano não está aprovado (status=${plan.status})` }
  }

  // Lock pessimista: muda para in_progress antes de qualquer trabalho pesado
  const { error: lockErr } = await admin
    .from('fix_plans')
    .update({ status: 'in_progress' })
    .eq('id', planId)
    .eq('status', 'approved')

  if (lockErr) {
    return { planId, status: 'fix_failed', patches: [], error: 'Falha ao lockear plano: ' + lockErr.message }
  }

  try {
    // Extrai paths de arquivos afetados do claude_analysis.affected_files
    const affectedFiles = (plan.claude_analysis as Record<string, unknown> | null)?.affected_files
    const filePaths = Array.isArray(affectedFiles) ? (affectedFiles as string[]) : []

    if (!filePaths.length) {
      throw new Error('claude_analysis.affected_files vazio — plano não tem arquivos identificados')
    }

    const fileContents = await readAffectedFiles(filePaths)
    if (!Object.keys(fileContents).length) {
      throw new Error('Nenhum arquivo afetado pôde ser lido (paths inválidos ou inexistentes)')
    }

    // Chama Claude para gerar os patches
    const claudeResp = await generatePatchesViaClaude(plan as FixPlanRow, fileContents)

    if (claudeResp.blocked_reason) {
      throw new Error('Claude bloqueou aplicação: ' + claudeResp.blocked_reason)
    }
    if (!claudeResp.patches?.length) {
      throw new Error('Claude não gerou nenhum patch')
    }

    // Persiste patches no plano (auditoria) ANTES de aplicar
    await admin
      .from('fix_plans')
      .update({
        claude_analysis: {
          ...(plan.claude_analysis ?? {}),
          patches:        claudeResp.patches,
          commit_message: claudeResp.commit_message,
          applied_at:     new Date().toISOString(),
        },
      })
      .eq('id', planId)

    // Dry-run: retorna patches sem mexer no FS
    if (opts?.dryRun) {
      return {
        planId,
        status:  'in_progress_patches_ready',
        patches: claudeResp.patches,
      }
    }

    // Aplica patches no FS
    const fsResult = await applyPatchesToFs(claudeResp.patches)
    if (fsResult.errors.length) {
      throw new Error('Erros ao escrever arquivos: ' + fsResult.errors.join('; '))
    }

    // Tenta criar branch + commit + PR
    const branch = `fix/${slugify(plan.title)}-${planId.slice(0, 8)}`
    const gitResult = await gitCommitAndPush(
      branch,
      claudeResp.commit_message || `fix: ${plan.title}`,
      fsResult.writtenPaths,
    )

    if (gitResult.prUrl) {
      await admin.from('fix_plans').update({
        status:      'pr_opened',
        branch_name: branch,
        pr_url:      gitResult.prUrl,
      }).eq('id', planId)
      return { planId, status: 'pr_opened', patches: claudeResp.patches, branch_name: branch, pr_url: gitResult.prUrl }
    }

    if (gitResult.localOnly) {
      // Aplicou os patches localmente mas sem PR — registra como completed
      // (operador externo abre PR manualmente revisando branch local).
      await admin.from('fix_plans').update({
        status:      'completed',
        branch_name: branch,
        test_results: {
          mode:           'local_only',
          note:           gitResult.error ?? 'git push/PR indisponível — patches commitados em branch local',
          written_paths:  fsResult.writtenPaths,
        },
      }).eq('id', planId)
      return { planId, status: 'completed', patches: claudeResp.patches, branch_name: branch, error: gitResult.error }
    }

    // Push ok mas PR falhou
    await admin.from('fix_plans').update({
      status:      'pr_opened',
      branch_name: branch,
      test_results: { note: gitResult.error },
    }).eq('id', planId)
    return { planId, status: 'pr_opened', patches: claudeResp.patches, branch_name: branch, error: gitResult.error }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[fix-applier] Falha ao aplicar plano ${planId}:`, message)
    await admin.from('fix_plans').update({
      status:       'fix_failed',
      test_results: { error: message, failed_at: new Date().toISOString() },
    }).eq('id', planId)
    return { planId, status: 'fix_failed', patches: [], error: message }
  }
}

/** Processa em lote todos os planos com status='approved'. */
export async function processAllApprovedPlans(
  opts?: { maxPlans?: number; dryRun?: boolean },
): Promise<{ processed: number; succeeded: number; failed: number; results: ApplyResult[] }> {
  const admin = createAdminClient()
  const max   = opts?.maxPlans ?? 5

  const { data: approved } = await admin
    .from('fix_plans')
    .select('id')
    .eq('status', 'approved')
    .order('approved_at', { ascending: true })
    .limit(max)

  const ids = (approved ?? []).map(r => r.id as string)
  const results: ApplyResult[] = []
  let succeeded = 0, failed = 0

  for (const id of ids) {
    const r = await applyApprovedFixPlan(id, { dryRun: opts?.dryRun })
    results.push(r)
    if (r.status === 'pr_opened' || r.status === 'completed' || r.status === 'in_progress_patches_ready') {
      succeeded++
    } else {
      failed++
    }
  }

  return { processed: ids.length, succeeded, failed, results }
}
