/**
 * Guarda de webhooks fail-closed.
 *
 * Risco: webhooks são endpoints públicos (sem sessão). A autorização por segredo
 * DEVE falhar fechada. Dois antipadrões:
 *  - fail-OPEN `if (expected && incoming !== expected)`: pula a checagem quando o
 *    segredo está vazio (env ausente/typo/rollback) → aceita forjaria (A1).
 *  - ausência total de segredo (autoriza só por telefone/campo do payload) (C4).
 *
 * Padrão baseline-delta: mantém o conjunto atual de webhooks fracos. Um webhook
 * NOVO fraco quebra o teste (regressão); um webhook CORRIGIDO também quebra,
 * pedindo para tirá-lo do baseline — o baseline só encolhe até zerar.
 *
 * Referência: SECURITY_AUDIT_2026-07-09.md (C4, A1).
 */
import { walk, read, rel } from './_helpers'

const WEBHOOK_DIR = 'src/app/api/webhooks'
const SECRET_ENV = /EVOLUTION_API_KEY|ASAAS[_A-Z]*TOKEN|WEBHOOK_SECRET|VERCEL[_A-Z]*SECRET|CRON_SECRET|_TOKEN\b|_SECRET\b/

/** Webhooks com padrão fail-open (A1). Zerado em fix/security-p0. Deve permanecer vazio. */
const BASELINE_FAIL_OPEN = new Set<string>([])

/** Webhooks sem autorização por segredo (C4). Zerado em fix/security-p0. Deve permanecer vazio. */
const BASELINE_NO_SECRET = new Set<string>([])

function webhookRoutes(): { path: string; src: string }[] {
  return walk(WEBHOOK_DIR, ['.ts'])
    .filter(p => p.endsWith('route.ts'))
    .map(p => ({ path: rel(p), src: read(p) }))
}

function isFailOpen(src: string): boolean {
  return /if\s*\(\s*(\w*[Kk]ey|\w*[Ss]ecret|\w*[Tt]oken|expected\w*)\s*&&[^)]*!==/.test(src)
}

describe('Webhooks — autorização fail-closed', () => {
  const routes = webhookRoutes()

  it('há webhooks para auditar', () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it('nenhum webhook NOVO usa o padrão fail-open `if (secret && incoming !== secret)`', () => {
    const detected = new Set(routes.filter(r => isFailOpen(r.src)).map(r => r.path))
    const novos = [...detected].filter(p => !BASELINE_FAIL_OPEN.has(p)).sort()
    const corrigidos = [...BASELINE_FAIL_OPEN].filter(p => !detected.has(p)).sort()
    expect(novos).toEqual([]) // regressão: use `if (!secret || incoming !== secret) return 401`
    expect(corrigidos).toEqual([]) // corrigido: remova do BASELINE_FAIL_OPEN
  })

  it('nenhum webhook NOVO fica sem autorização por segredo', () => {
    const detected = new Set(routes.filter(r => !SECRET_ENV.test(r.src)).map(r => r.path))
    const novos = [...detected].filter(p => !BASELINE_NO_SECRET.has(p)).sort()
    const corrigidos = [...BASELINE_NO_SECRET].filter(p => !detected.has(p)).sort()
    expect(novos).toEqual([]) // regressão: todo webhook precisa validar um segredo (apikey/HMAC)
    expect(corrigidos).toEqual([]) // corrigido: remova do BASELINE_NO_SECRET
  })
})
