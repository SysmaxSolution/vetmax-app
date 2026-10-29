import { montarFolha, montarResumo, montarPerdas, montarLancamentosGerais, historicoDaLinha, nomeDaAba, dataHoraBR } from '@/lib/controlled/livro-fiscal'
import type { ControlledBook, ControlledItemBook, ControlledLedgerEntry } from '@/types/controlled-book'

const linha = (p: Partial<ControlledLedgerEntry>): ControlledLedgerEntry => ({
  movement_id: null, date: '2026-01-02T11:00:00.000Z', kind: 'saida', quantity: -1, balance: 0, origin: 'Consulta',
  reference: null, document: null, os_number: null, patient_name: null, tutor_name: null, procedure_name: null,
  counterparty: null, batch_number: null, expires_at: null, loss_reason: null, responsible: null, notes: null, ...p,
})

const propofol: ControlledItemBook = {
  stock_item_id: 'p', name: 'Propofol', substance: 'Propofol', concentration: '10 mg/mL', control_class: null, is_human_use: true, unit: 'mL',
  opening_balance: 100, total_in: 60, total_out: 26, total_loss: 20, closing_balance: 114,
  entries: [
    linha({ date: '2026-01-02T11:00:00.000Z', kind: 'saida', quantity: -17, balance: 83, os_number: '203875', patient_name: 'Luke Ferre', tutor_name: 'Renata Ferreira', procedure_name: 'ANESTESIA TOMOGRAFIA 11 A 20 KG', batch_number: 'INI-PRO-27' }),
    linha({ date: '2026-01-02T11:00:00.000Z', kind: 'saida', quantity: -9, balance: 74, os_number: '203918', patient_name: 'Sofia', tutor_name: 'Vera Lucia', procedure_name: 'ANESTESIA TOMOGRAFIA 11 A 20 KG' }),
    linha({ date: '2026-01-13T11:00:00.000Z', kind: 'entrada', quantity: 60, balance: 134, origin: 'Compra/Reposição', counterparty: 'LPS Agrofarma', document: '187159', batch_number: 'L260113-1', expires_at: '2028-01-13' }),
    linha({ date: '2026-08-12T12:10:00.000Z', kind: 'perda', quantity: -20, balance: 114, origin: 'Ajuste manual', loss_reason: 'Frasco quebrado', responsible: 'Aline', batch_number: 'L260113-1' }),
  ],
}
const isoflurano: ControlledItemBook = {
  stock_item_id: 'i', name: 'Isoflurano', substance: 'Isoflurano', concentration: null, control_class: null, is_human_use: true, unit: 'mL',
  opening_balance: 480, total_in: 0, total_out: 1, total_loss: 0, closing_balance: 479,
  entries: [linha({ date: '2026-01-02T11:00:00.000Z', kind: 'saida', quantity: -1, balance: 479, os_number: '203875', patient_name: 'Luke Ferre', tutor_name: 'Renata Ferreira', procedure_name: 'ANESTESIA TOMOGRAFIA 11 A 20 KG' })],
}
const book: ControlledBook = {
  from: '2026-01-01', to: '2026-10-31', generated_at: '2026-10-29T12:00:00.000Z',
  clinic: { name: 'Animais Diagnóstico por Imagem', cnpj: '23.692.661/0001-20', address: null, city: 'Ribeirão Preto', state: 'SP', cep: null, technical_responsible_name: 'Dra. X', technical_responsible_crmv: 'CRMV-SP 1' },
  human: [propofol, isoflurano], veterinary: [],
}

describe('livro fiscal — folha por medicamento', () => {
  it('monta DATA | HISTÓRICO | MOVIMENTO | ESTOQUE como a planilha da Vigilância', () => {
    const f = montarFolha(propofol)
    expect(f.saldo_anterior).toBe(100)
    expect(f.linhas).toHaveLength(4)
    expect(f.linhas[0]).toMatchObject({ data: '02/01/2026', hora: '08:00', pet_responsavel: 'Luke Ferre - Renata Ferreira', procedimento: 'ANESTESIA TOMOGRAFIA 11 A 20 KG', os: '203875', entrada: null, saida: 17, perdas: null, estoque: 83, observacoes: 'Lote INI-PRO-27' })
    expect(f.linhas[2]).toMatchObject({ pet_responsavel: 'Entrada', procedimento: 'LPS Agrofarma, NF 187159', os: '187159', entrada: 60, saida: null, estoque: 134, observacoes: 'Lote L260113-1 · val. 13/01/2028' })
    expect(f.linhas[3]).toMatchObject({ pet_responsavel: 'Perda / inutilização', procedimento: 'Frasco quebrado', perdas: 20, responsavel: 'Aline' })
    expect(f.total_entradas).toBe(60); expect(f.total_saidas).toBe(26); expect(f.total_perdas).toBe(20); expect(f.saldo_final).toBe(114)
  })

  it('resumo de saldos fecha: inicial + entradas − saídas − perdas = final', () => {
    const r = montarResumo(book)
    expect(r.map(x => x.medicamento)).toEqual(['Isoflurano', 'Propofol'])
    for (const x of r) expect(x.saldo_inicial + x.entradas - x.saidas - x.perdas).toBeCloseTo(x.saldo_final, 3)
  })

  it('aba de perdas lista só as perdas, com motivo e responsável', () => {
    const p = montarPerdas(book)
    expect(p).toEqual([expect.objectContaining({ medicamento: 'Propofol', quantidade: 20, motivo: 'Frasco quebrado', responsavel: 'Aline', data: '12/08/2026' })])
  })

  it('lançamentos gerais agrupa a mesma OS numa linha com um par Entrada/Saída por medicamento', () => {
    const { medicamentos, linhas } = montarLancamentosGerais(book)
    expect(medicamentos).toEqual(['Isoflurano', 'Propofol'])
    const os = linhas.find(l => l.os === '203875')!
    expect(os.animal_tutor).toBe('Luke Ferre - Renata Ferreira')
    expect(os.valores).toEqual({ Propofol: { entrada: 0, saida: 17 }, Isoflurano: { entrada: 0, saida: 1 } })
    expect(linhas.find(l => l.os === '187159')).toMatchObject({ animal_tutor: 'Entrada', valores: { Propofol: { entrada: 60, saida: 0 } } })
    expect(linhas.some(l => l.procedimento === 'Frasco quebrado')).toBe(false)   // perda não entra na tabela cruzada
  })

  it('linha antiga sem histórico estruturado ainda sai legível', () => {
    const h = historicoDaLinha(linha({ kind: 'saida', origin: 'Venda (PDV)', reference: 'Maria' }))
    expect(h.pet_responsavel).toBe('Maria')
    const k = historicoDaLinha(linha({ kind: 'saida', origin: 'Consulta', notes: 'Consulta - OS 123 - Rex' }))
    expect(k.procedimento).toBe('Consulta - OS 123 - Rex')
  })

  it('nome de aba cabe no Excel', () => {
    expect(nomeDaAba('Fentanil 0,05 mg/mL [ampola]')).toBe('Fentanil 0,05 mg mL ampola')
    expect(nomeDaAba('Levetiracetam injetável 500 mg/5 mL frasco').length).toBeLessThanOrEqual(31)
    expect(dataHoraBR('2026-02-25T11:10:35.000Z')).toEqual({ data: '25/02/2026', hora: '08:10' })
  })
})
