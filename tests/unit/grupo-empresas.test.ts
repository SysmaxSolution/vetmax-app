import { montarGrupo, cnpjChave, variantesCnpj } from '@/lib/clinics/grupo-empresas'

const DIAG = { id: 'diag', name: 'Animais Diagnóstico por Imagem', cnpj: '23.692.661/0001-20' }
const VET  = { id: 'vet',  name: 'Animais Clínica Veterinária',    cnpj: '18.767.441/0001-89' }
const PET  = { id: 'pet',  name: 'Animais Pet',                    cnpj: '02.154.085/0001-98' }
const OUTRA = { id: 'outra', name: 'Clínica Sem Relação',          cnpj: '11.222.333/0001-81' }

// Empresas cadastradas só na Diagnóstico, CNPJ sem máscara (como em produção).
const EMPRESAS = [
  { clinic_id: 'diag', cnpj: '23692661000120' },
  { clinic_id: 'diag', cnpj: '02154085000198' },
  { clinic_id: 'diag', cnpj: '18767441000189' },
]

describe('grupo de clínicas por CNPJ das Empresas', () => {
  it('normaliza CNPJ com e sem máscara para a mesma chave', () => {
    expect(cnpjChave('23.692.661/0001-20')).toBe('23692661000120')
    expect(cnpjChave('23692661000120')).toBe('23692661000120')
    expect(cnpjChave('123')).toBeNull()
    expect(variantesCnpj('23692661000120')).toEqual(['23692661000120', '23.692.661/0001-20'])
  })

  it('a clínica que cadastrou as empresas enxerga as outras duas, a origem primeiro', () => {
    const g = montarGrupo('diag', [DIAG, VET, PET, OUTRA], EMPRESAS)
    expect(g.map(c => c.id)).toEqual(['diag', 'vet', 'pet'])
  })

  it('vale no sentido inverso e é transitivo: a Pet, sem empresa nenhuma, enxerga Diagnóstico e Veterinária', () => {
    const g = montarGrupo('pet', [DIAG, VET, PET, OUTRA], EMPRESAS)
    expect(g.map(c => c.id)).toEqual(['pet', 'vet', 'diag'])
  })

  it('clínica sem ligação fica sozinha', () => {
    expect(montarGrupo('outra', [DIAG, VET, PET, OUTRA], EMPRESAS).map(c => c.id)).toEqual(['outra'])
  })

  it('empresa com o próprio CNPJ da clínica não cria laço nem duplica', () => {
    const g = montarGrupo('diag', [DIAG], [{ clinic_id: 'diag', cnpj: '23692661000120' }])
    expect(g).toHaveLength(1)
  })

  it('empresa sem CNPJ ou com CNPJ de clínica inexistente é ignorada', () => {
    const g = montarGrupo('diag', [DIAG, VET], [{ clinic_id: 'diag', cnpj: null }, { clinic_id: 'diag', cnpj: '99.999.999/0001-99' }])
    expect(g.map(c => c.id)).toEqual(['diag'])
  })
})
