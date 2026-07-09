/**
 * Guarda do gate de assinatura (paywall).
 *
 * Risco (C3): o gate de runtime que libera módulos pagos decide por
 * `status === 'active'|'trialing'`, mas `subscribeToPlan` grava `status:'active'`
 * ANTES do pagamento (o estado pago real fica em `lifecycle_state`). Resultado:
 * um admin assina Enterprise, nunca paga a fatura, e usa o produto de graça.
 *
 * Invariante desejada: o gate deve considerar `lifecycle_state` (estado pago) —
 * não liberar bundle pago só por `status`. Padrão baseline-delta: quando o gate
 * passar a referenciar `lifecycle_state`, o teste quebra pedindo para tirá-lo do
 * baseline e converter numa asserção permanente.
 *
 * Referência: SECURITY_AUDIT_2026-07-09.md (C3).
 */
import { read, REPO_ROOT } from './_helpers'
import { join } from 'path'
import { existsSync } from 'fs'

const GATE = 'src/lib/subscription/gatekeeper.ts'

/** Gates sem checagem de lifecycle_state (C3). Zerado em fix/security-p0. Deve permanecer vazio. */
const BASELINE_GATES_WITHOUT_LIFECYCLE = new Set<string>([])

describe('Gate de assinatura — não liberar plano pago sem pagamento', () => {
  const abs = join(REPO_ROOT, GATE)

  it('o arquivo do gate existe', () => {
    expect(existsSync(abs)).toBe(true)
  })

  it('o gate passa a checar lifecycle_state assim que C3 for corrigido (baseline encolhe)', () => {
    const src = existsSync(abs) ? read(abs) : ''
    const decideAcessoPorStatus = /status\s*===\s*['"](active|trialing)['"]/.test(src)
    const checaLifecycle = /lifecycle_state/.test(src)
    const aindaVulneravel = decideAcessoPorStatus && !checaLifecycle

    const detected = new Set(aindaVulneravel ? [GATE] : [])
    const corrigidos = [...BASELINE_GATES_WITHOUT_LIFECYCLE].filter(g => !detected.has(g)).sort()
    const novos = [...detected].filter(g => !BASELINE_GATES_WITHOUT_LIFECYCLE.has(g)).sort()

    expect(novos).toEqual([]) // regressão: novo gate liberando plano pago só por `status`
    expect(corrigidos).toEqual([]) // corrigido: remova do baseline e trave `lifecycle_state` de forma permanente
  })
})
