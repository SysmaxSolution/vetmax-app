import { EsquemaCriarTitulo } from '@/lib/validation/financeiro'
import { valida } from '@/lib/validation/primitivos'

// Bloco A da revisão da conciliação. Três defeitos reais, apontados pelo
// Diretor e confirmados no código:
//
//  1. `updateEntry` não tinha filtro de status nenhum — o UPDATE era
//     .update(updates).eq('id', id).eq('clinic_id', clinicId) — e alterava
//     valor, vencimento e tutor de título JÁ BAIXADO, sem rastro. Isso muda a
//     data de uma transação que já aconteceu e desalinha a conciliação.
//     (travado na action; aqui ficam as regras puras)
//
//  2. Nenhuma validação entre datas: dava para gravar vencimento anterior à
//     emissão — título vencendo antes de existir.
//
//  3. O auto-vínculo usava `payment_date ?? due_date`. Com 3 títulos `paid` e
//     payment_date nulo no banco de testes, ele casava pelo VENCIMENTO com
//     uma transação qualquer. Agora exige a data da baixa.

const base = {
  type: 'receivable' as const,
  description: 'Consulta',
  amount: 150,
  due_date: '2026-10-20',
}

describe('emissão não pode ser posterior ao vencimento', () => {
  it('aceita emissão antes do vencimento', () => {
    expect('dados' in valida(EsquemaCriarTitulo, { ...base, issue_date: '2026-10-01' })).toBe(true)
  })

  it('aceita emissão no MESMO dia do vencimento (à vista)', () => {
    expect('dados' in valida(EsquemaCriarTitulo, { ...base, issue_date: '2026-10-20' })).toBe(true)
  })

  it('recusa emissão DEPOIS do vencimento', () => {
    const r = valida(EsquemaCriarTitulo, { ...base, issue_date: '2026-10-25' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/emiss[ãa]o n[ãa]o pode ser posterior/i)
  })

  it('sem emissão informada, não bloqueia (campo é opcional)', () => {
    expect('dados' in valida(EsquemaCriarTitulo, base)).toBe(true)
  })

  it('NÃO confunde com atraso: pagar depois do vencimento é normal e não é regra deste esquema', () => {
    // O esquema de criação não conhece pagamento; a regra de atraso não existe
    // de propósito — título em atraso é rotina, não erro.
    const r = valida(EsquemaCriarTitulo, { ...base, issue_date: '2026-09-01', due_date: '2026-09-10' })
    expect('dados' in r).toBe(true)
  })
})

describe('as outras regras do esquema seguem valendo', () => {
  it('desconto maior que o valor continua recusado', () => {
    expect('error' in valida(EsquemaCriarTitulo, { ...base, discount: 200 })).toBe(true)
  })

  it('data inexistente continua recusada', () => {
    expect('error' in valida(EsquemaCriarTitulo, { ...base, due_date: '2026-02-30' })).toBe(true)
  })

  it('valor com 3 casas continua recusado (centavo fantasma)', () => {
    expect('error' in valida(EsquemaCriarTitulo, { ...base, amount: 150.555 })).toBe(true)
  })
})
