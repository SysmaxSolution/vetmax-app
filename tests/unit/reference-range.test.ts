import { parseFaixa } from '@/lib/lab/reference-range'

// A clínica digita a faixa como ela imprime. Se o sistema ler errado, o laudo
// marca alto/baixo errado num documento clínico — por isso cada formato que a
// Animais usa de verdade tem caso aqui.
describe('leitura da faixa escrita pela clínica', () => {
  it('entende os formatos do print da Amanda', () => {
    expect(parseFaixa('5,5 A 8,5 milhões/mm³')).toEqual({ low: 5.5, high: 8.5 })
    expect(parseFaixa('12,0 A 18,0 g/dl')).toEqual({ low: 12, high: 18 })
    expect(parseFaixa('37 A 55 %')).toEqual({ low: 37, high: 55 })
    expect(parseFaixa('19,5 A 24,5 pg')).toEqual({ low: 19.5, high: 24.5 })
    expect(parseFaixa('200 a 500 mil/mm³')).toEqual({ low: 200, high: 500 })
    expect(parseFaixa('3300 A 12800')).toEqual({ low: 3300, high: 12800 })
  })

  it('aceita também os separadores dos aparelhos', () => {
    expect(parseFaixa('0.5~1.5')).toEqual({ low: 0.5, high: 1.5 })   // BIOBASE BK-200
    expect(parseFaixa('6.0-17.0')).toEqual({ low: 6, high: 17 })     // URIT BH-5100
    expect(parseFaixa('2 até 10 %')).toEqual({ low: 2, high: 10 })
  })

  it('número sozinho vira teto — é como a Animais escreve "0 %"', () => {
    expect(parseFaixa('0 %')).toEqual({ low: null, high: 0 })
    expect(parseFaixa('0')).toEqual({ low: null, high: 0 })
  })

  it('texto que não dá para interpretar não vira número inventado', () => {
    expect(parseFaixa('conforme a espécie')).toEqual({ low: null, high: null })
    expect(parseFaixa('')).toEqual({ low: null, high: null })
    expect(parseFaixa(null)).toEqual({ low: null, high: null })
    expect(parseFaixa(undefined)).toEqual({ low: null, high: null })
  })

  it('não confunde o hífen de número negativo com separador de faixa', () => {
    expect(parseFaixa('-2,5 A 3,0')).toEqual({ low: -2.5, high: 3 })
  })
})
