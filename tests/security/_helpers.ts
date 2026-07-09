/**
 * Helpers da bateria de segurança — leitura de código-fonte e do índice do git.
 * Sem dependência de banco: todas as guardas são estáticas.
 */
import { execSync } from 'child_process'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

export const REPO_ROOT = join(__dirname, '..', '..')

/** Lista recursivamente arquivos sob `dir` (relativo à raiz) que casem com a extensão. */
export function walk(dir: string, exts = ['.ts', '.tsx']): string[] {
  const abs = join(REPO_ROOT, dir)
  const out: string[] = []
  const rec = (d: string) => {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const name of entries) {
      const p = join(d, name)
      let s
      try {
        s = statSync(p)
      } catch {
        continue
      }
      if (s.isDirectory()) {
        if (name === 'node_modules' || name === '.next' || name === '.git') continue
        rec(p)
      } else if (exts.some(e => name.endsWith(e))) {
        out.push(p)
      }
    }
  }
  rec(abs)
  return out
}

export function read(absPath: string): string {
  return readFileSync(absPath, 'utf8')
}

/** Caminho relativo à raiz do repo, com separador POSIX (estável entre SOs). */
export function rel(absPath: string): string {
  return absPath.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')
}

/** Arquivos rastreados pelo git (índice), com caminho POSIX. Vazio se git indisponível. */
export function gitTrackedFiles(): string[] {
  try {
    const out = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8' })
    return out.split('\n').map(s => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

/** Um arquivo é uma Server Action se declara a diretiva 'use server' no topo do módulo. */
export function isUseServerModule(src: string): boolean {
  const head = src.slice(0, 400)
  return /^\s*['"]use server['"]/m.test(head)
}
