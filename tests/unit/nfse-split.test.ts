/**
 * Unit — NFS-e desmembrada por empresa faturante (item 1.A).
 */
import { groupServicesByCompany } from '@/lib/billing/nfse-split'

describe('groupServicesByCompany', () => {
  it('agrupa por company_id', () => {
    const g = groupServicesByCompany([
      { company_id: 'A', name: 's1' },
      { company_id: 'A', name: 's2' },
      { company_id: 'B', name: 's3' },
    ])
    expect(g.get('A')).toHaveLength(2)
    expect(g.get('B')).toHaveLength(1)
    expect(g.size).toBe(2)
  })

  it('company_id null vira grupo único (nível clínica)', () => {
    const g = groupServicesByCompany([{ company_id: null }, { company_id: undefined as any }])
    expect(g.get(null)).toHaveLength(2)
  })

  it('empresa única → 1 grupo', () => {
    const g = groupServicesByCompany([{ company_id: 'X' }, { company_id: 'X' }, { company_id: 'X' }])
    expect(g.size).toBe(1)
    expect(g.get('X')).toHaveLength(3)
  })

  it('multi-CNPJ na mesma OS → N grupos', () => {
    const g = groupServicesByCompany([{ company_id: 'A' }, { company_id: 'B' }, { company_id: 'C' }])
    expect(g.size).toBe(3)
  })

  it('lista vazia → mapa vazio', () => {
    expect(groupServicesByCompany([]).size).toBe(0)
  })

  it('preserva os itens de cada grupo', () => {
    const g = groupServicesByCompany([{ company_id: 'A', id: 1 }, { company_id: 'A', id: 2 }])
    expect((g.get('A') as any[]).map(s => s.id)).toEqual([1, 2])
  })
})
