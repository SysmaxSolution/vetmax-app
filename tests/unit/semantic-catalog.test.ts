/**
 * Unit — Semantic layer do Relatório Inteligente (1.c). Guardrail: só aceita
 * spec do catálogo; extração de dimensão determinística.
 */
import { validateSpec, dimensionValue, catalogPromptSummary } from '@/lib/reports/semantic-catalog'

describe('validateSpec', () => {
  it('aceita spec válida do catálogo', () => {
    const s = validateSpec({ metric: 'faturamento', dimension: 'category', from: '2026-01-01', to: '2026-01-31' })
    expect('error' in s).toBe(false)
  })
  it('rejeita métrica fora do catálogo', () => {
    expect(validateSpec({ metric: 'lucro_secreto', dimension: 'category', from: '2026-01-01', to: '2026-01-31' })).toHaveProperty('error')
  })
  it('rejeita dimensão fora do catálogo (anti-injeção)', () => {
    expect(validateSpec({ metric: 'faturamento', dimension: 'senha; DROP TABLE', from: '2026-01-01', to: '2026-01-31' })).toHaveProperty('error')
  })
  it('rejeita datas inválidas e invertidas', () => {
    expect(validateSpec({ metric: 'faturamento', dimension: 'month', from: 'ontem', to: '2026-01-31' })).toHaveProperty('error')
    expect(validateSpec({ metric: 'faturamento', dimension: 'month', from: '2026-02-01', to: '2026-01-31' })).toHaveProperty('error')
  })
  it('só mantém filtros do allowlist', () => {
    const s = validateSpec({ metric: 'faturamento', dimension: 'month', from: '2026-01-01', to: '2026-01-31', filters: { category: 'Consulta', hack: 'x' } }) as any
    expect(s.filters.category).toBe('Consulta')
    expect(s.filters.hack).toBeUndefined()
  })
  it('spec não-objeto → erro', () => {
    expect(validateSpec(null)).toHaveProperty('error')
    expect(validateSpec('DROP TABLE')).toHaveProperty('error')
  })
})

describe('dimensionValue', () => {
  const maps = { companyName: new Map([['c1', 'Emp 001']]), tutorName: new Map([['t1', 'Maria']]) }
  it('mês vem do payment_date', () => {
    expect(dimensionValue('month', { payment_date: '2026-03-15' }, maps)).toEqual({ key: '2026-03', label: '2026-03' })
  })
  it('categoria com fallback', () => {
    expect(dimensionValue('category', { category: null }, maps).label).toBe('Sem categoria')
  })
  it('empresa resolve nome pelo mapa', () => {
    expect(dimensionValue('company', { company_id: 'c1' }, maps).label).toBe('Emp 001')
  })
  it('cliente resolve nome pelo mapa', () => {
    expect(dimensionValue('tutor', { tutor_id: 't1' }, maps).label).toBe('Maria')
  })
  it('forma de pagamento traduz o rótulo', () => {
    expect(dimensionValue('payment_method', { payment_method: 'pix' }, maps).label).toBe('PIX')
  })
})

describe('catalogPromptSummary', () => {
  it('descreve métricas e dimensões para o prompt', () => {
    const s = catalogPromptSummary()
    expect(s).toContain('faturamento')
    expect(s).toContain('category')
  })
})
