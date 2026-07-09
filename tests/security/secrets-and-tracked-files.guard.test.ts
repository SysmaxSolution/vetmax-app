/**
 * Guarda de segredos e arquivos versionados.
 *
 * Riscos:
 *  - C1: connection string de produção (`postgresql://...:senha@...`) commitada.
 *  - Arquivos de debug (`debug-*.js`) rastreados no git carregando credenciais.
 *  - Segredo em variável `NEXT_PUBLIC_*` (vai inteiro para o bundle do browser).
 *
 * Referência: SECURITY_AUDIT_2026-07-09.md (C1, B11).
 */
import { walk, read, rel, gitTrackedFiles, REPO_ROOT } from './_helpers'
import { join } from 'path'

/** Nomes que jamais devem aparecer sob o prefixo público NEXT_PUBLIC_. */
const SECRET_TOKENS = /(SERVICE_ROLE|ANTHROPIC|EVOLUTION_API_KEY|_SECRET|_TOKEN|PASSWORD|PRIVATE_KEY|MASTER_KEY)/

/**
 * DÍVIDA P0 ATIVA (C1), não risco aceito: arquivos de debug rastreados com/sem
 * credencial literal. Ação: `git rm` + purgar histórico + ROTACIONAR a senha do
 * banco no Supabase. Quando purgados, o teste quebra pedindo para esvaziar o
 * baseline. NÃO adicionar itens aqui — este conjunto só deve encolher até zerar.
 */
// Zerados em fix/security-p0: debug-*.js destrackeados (git rm --cached) + gitignore.
// LEMBRETE MANUAL (não automatizável): purgar do HISTÓRICO git (BFG/filter-repo) e
// ROTACIONAR a senha do banco no Supabase — a credencial commitada está comprometida.
const KNOWN_C1_DEBT_CREDS = new Set<string>([])
const KNOWN_DEBUG_TRACKED = new Set<string>([])

/** Placeholder/env-interpolação — não é vazamento de segredo real. */
function isPlaceholderConn(user: string, pass: string): boolean {
  if (pass.startsWith('${') || pass.startsWith('<') || pass.startsWith('[')) return true
  if (user === 'user' || user === 'usuario' || user === '<user>') return true
  return /^(password|senha|your|xxx+|changeme|placeholder|pass)$/i.test(pass)
}

describe('Segredos e arquivos versionados', () => {
  const tracked = gitTrackedFiles()

  it('git ls-files respondeu (guarda depende do índice do git)', () => {
    expect(tracked.length).toBeGreaterThan(0)
  })

  it('nenhuma connection string de produção com senha LITERAL está versionada (C1)', () => {
    const re = /postg(?:res(?:ql)?):\/\/([^:\s'"]+):([^@\s'"]+)@/g // usuario:senha@host
    const detected: string[] = []
    for (const f of tracked) {
      if (!/\.(ts|tsx|js|mjs|cjs|json|env|sql|ya?ml|md)$/i.test(f)) continue
      let src = ''
      try {
        src = read(join(REPO_ROOT, f))
      } catch {
        continue
      }
      let m: RegExpExecArray | null
      re.lastIndex = 0
      while ((m = re.exec(src))) {
        if (!isPlaceholderConn(m[1], m[2])) {
          detected.push(f)
          break
        }
      }
    }
    const novos = detected.filter(f => !KNOWN_C1_DEBT_CREDS.has(f)).sort()
    const corrigidos = [...KNOWN_C1_DEBT_CREDS].filter(f => !detected.includes(f)).sort()
    expect(novos).toEqual([]) // regressão: leia de process.env e ROTACIONE a credencial
    expect(corrigidos).toEqual([]) // purgado: esvazie KNOWN_C1_DEBT_CREDS
  })

  it('nenhum arquivo debug-*.js NOVO está rastreado no git (C1)', () => {
    const detected = tracked.filter(f => /(^|\/)debug-[^/]*\.js$/i.test(f))
    const novos = detected.filter(f => !KNOWN_DEBUG_TRACKED.has(f)).sort()
    const corrigidos = [...KNOWN_DEBUG_TRACKED].filter(f => !detected.includes(f)).sort()
    expect(novos).toEqual([]) // scratch de debug não pode ser versionado
    expect(corrigidos).toEqual([]) // removido: esvazie KNOWN_DEBUG_TRACKED
  })

  it('nenhuma variável NEXT_PUBLIC_* carrega nome de segredo', () => {
    const ofensores: { file: string; hit: string }[] = []
    for (const abs of walk('src', ['.ts', '.tsx'])) {
      const src = read(abs)
      const re = /NEXT_PUBLIC_[A-Z0-9_]+/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        if (SECRET_TOKENS.test(m[0])) ofensores.push({ file: rel(abs), hit: m[0] })
      }
    }
    // NEXT_PUBLIC_MODULE_MASTER_KEY (B11) é dívida conhecida — mover para var server-only.
    const KNOWN = new Set(['NEXT_PUBLIC_MODULE_MASTER_KEY'])
    const novos = ofensores.filter(o => !KNOWN.has(o.hit))
    expect(novos).toEqual([]) // regressão: segredo em NEXT_PUBLIC_* vaza para o browser
  })
})
