// Resolução do fornecedor a partir do DDA — a ordem de busca é o que impede
// o cadastro de encher de duplicata.
//
// O caso que motivou tudo: o DDA do Sicoob devolve a razão social TRUNCADA em
// 40 caracteres. Medido na resposta real da Clínica Animais:
// "SAPRA LANDAUER SERVICO DE ASSESSORIA E P" — cortado no meio da palavra.
// Se o fornecedor fosse resolvido por nome, o dia em que alguém digitasse o
// nome completo nasceria um segundo cadastro para o mesmo CNPJ.

jest.mock('@/lib/cnpj', () => ({
  lookupCnpj: jest.fn(),
}))

import { lookupCnpj } from '@/lib/cnpj'
import {
  resolverFornecedor, apenasDigitos, documentoValido, formatarCnpj,
} from '@/lib/financial/fornecedor-dda'

const mockLookup = lookupCnpj as jest.MockedFunction<typeof lookupCnpj>

const CNPJ = '50429810000136'
const TRUNCADO = 'SAPRA LANDAUER SERVICO DE ASSESSORIA E P'
const COMPLETO = 'SAPRA LANDAUER SERVICO DE ASSESSORIA E PROTECAO RADIOLOGICA LTDA'

/** Fake do client: responde por tabela, registra o que foi gravado. */
function fakeAdmin(estado: { suppliers: Record<string, unknown>[] }) {
  const gravados: { tabela: string; acao: string; dados: Record<string, unknown> }[] = []
  const api = {
    from(tabela: string) {
      const q: Record<string, unknown> = {}
      const self: Record<string, unknown> = {
        select: () => self, eq: () => self, not: () => self, in: () => self,
        then: undefined,
        insert(dados: Record<string, unknown>) {
          gravados.push({ tabela, acao: 'insert', dados })
          const novo = { id: 'novo-' + (estado.suppliers.length + 1), ...dados }
          estado.suppliers.push(novo)
          return { select: () => ({ single: async () => ({ data: novo, error: null }) }) }
        },
        update(dados: Record<string, unknown>) {
          gravados.push({ tabela, acao: 'update', dados })
          return { eq: () => ({ eq: async () => ({ error: null }) }) }
        },
      }
      // o resolvedor sempre encadeia select().eq().not() e aguarda o resultado
      const resultado = Promise.resolve({ data: estado.suppliers, error: null })
      ;(self as Record<string, unknown>).then = resultado.then.bind(resultado)
      ;(self as Record<string, unknown>).catch = resultado.catch.bind(resultado)
      void q
      return self
    },
  }
  return { api: api as never, gravados }
}

beforeEach(() => {
  mockLookup.mockReset()
  mockLookup.mockResolvedValue({
    ok: true, cnpj: CNPJ, razao_social: COMPLETO, nome_fantasia: 'SAPRA',
    phone: '1633334444', email: 'contato@sapra.test', address: 'Rua X, 10 — Ribeirão Preto/SP',
  })
})

describe('normalização do documento', () => {
  it('compara só dígitos — o mesmo CNPJ chega mascarado ou limpo', () => {
    expect(apenasDigitos('50.429.810/0001-36')).toBe(CNPJ)
    expect(apenasDigitos(CNPJ)).toBe(CNPJ)
    expect(apenasDigitos(null)).toBe('')
  })

  it('aceita CNPJ e CPF, recusa o resto', () => {
    expect(documentoValido(CNPJ)).toBe(true)
    expect(documentoValido('12345678901')).toBe(true)   // CPF
    expect(documentoValido('123')).toBe(false)
    expect(documentoValido(null)).toBe(false)
  })

  it('formata para gravar legível', () => {
    expect(formatarCnpj(CNPJ)).toBe('50.429.810/0001-36')
    expect(formatarCnpj('12345678901')).toBe('123.456.789-01')
  })
})

describe('resolução', () => {
  it('acha pelo CNPJ mesmo quando o cadastro está mascarado e o boleto não', async () => {
    const { api } = fakeAdmin({ suppliers: [
      { id: 'sup-1', name: 'SAPRA LANDAUER', document: '50.429.810/0001-36' },
    ] })
    const r = await resolverFornecedor(api, 'cli-1', { beneficiary: TRUNCADO, beneficiary_doc: CNPJ })
    expect(r.origem).toBe('encontrado')
    expect(r.supplier_id).toBe('sup-1')
    // já existe: não gasta consulta pública
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it('cria com a razão social COMPLETA da consulta, não com a truncada do banco', async () => {
    const { api, gravados } = fakeAdmin({ suppliers: [] })
    const r = await resolverFornecedor(api, 'cli-1', { beneficiary: TRUNCADO, beneficiary_doc: CNPJ })
    expect(r.origem).toBe('criado')
    expect(r.nome_enriquecido).toBe(true)
    const ins = gravados.find(g => g.acao === 'insert')!
    expect(ins.dados.name).toBe(COMPLETO)
    expect(ins.dados.name).not.toBe(TRUNCADO)
    expect(ins.dados.document).toBe('50.429.810/0001-36')
    expect(ins.dados.phone).toBe('1633334444')
  })

  it('NÃO informa `category` — a coluna tem CHECK com lista fechada', async () => {
    // Regressão de produção (16/10): o insert gravava category 'Fornecedores',
    // que não está em ('medicamentos','alimentos','equipamentos','servicos',
    // 'limpeza','escritorio','outros'). O CHECK recusava, o erro era engolido
    // para não derrubar o título, e o resultado foi 4 títulos lançados com
    // ZERO fornecedores criados — sem nenhum aviso na tela.
    const { api, gravados } = fakeAdmin({ suppliers: [] })
    await resolverFornecedor(api, 'cli-1', { beneficiary: TRUNCADO, beneficiary_doc: CNPJ })
    const ins = gravados.find(g => g.acao === 'insert')!
    expect(ins.dados).not.toHaveProperty('category')
  })

  it('cai para o nome do banco quando a consulta pública falha', async () => {
    mockLookup.mockResolvedValue({ ok: false, reason: 'network' })
    const { api, gravados } = fakeAdmin({ suppliers: [] })
    const r = await resolverFornecedor(api, 'cli-1', { beneficiary: TRUNCADO, beneficiary_doc: CNPJ })
    expect(r.origem).toBe('criado')
    expect(r.nome_enriquecido).toBe(false)
    expect(gravados.find(g => g.acao === 'insert')!.dados.name).toBe(TRUNCADO)
  })

  it('ADOTA o cadastro digitado à mão que está sem CNPJ, em vez de duplicar', async () => {
    const { api, gravados } = fakeAdmin({ suppliers: [
      { id: 'sup-9', name: COMPLETO, document: null },
    ] })
    const r = await resolverFornecedor(api, 'cli-1', { beneficiary: TRUNCADO, beneficiary_doc: CNPJ })
    expect(r.origem).toBe('adotado')
    expect(r.supplier_id).toBe('sup-9')
    expect(gravados.some(g => g.acao === 'insert')).toBe(false)   // nada criado
    const upd = gravados.find(g => g.acao === 'update')!
    expect(upd.dados.document).toBe('50.429.810/0001-36')
  })

  it('sem documento não inventa cadastro — o boleto entra, o fornecedor não', async () => {
    const { api, gravados } = fakeAdmin({ suppliers: [] })
    const r = await resolverFornecedor(api, 'cli-1', { beneficiary: 'FORNECEDOR SEM CNPJ', beneficiary_doc: null })
    expect(r.origem).toBe('sem_documento')
    expect(r.supplier_id).toBeNull()
    expect(gravados).toHaveLength(0)
  })

  it('não cria quando criarSeNaoExistir é falso — é o modo da prévia', async () => {
    const { api, gravados } = fakeAdmin({ suppliers: [] })
    const r = await resolverFornecedor(api, 'cli-1',
      { beneficiary: TRUNCADO, beneficiary_doc: CNPJ }, { criarSeNaoExistir: false })
    expect(r.supplier_id).toBeNull()
    expect(gravados).toHaveLength(0)
  })

  it('erro do banco não derruba o lançamento — devolve origem erro', async () => {
    const api = { from: () => { throw new Error('conexão caiu') } } as never
    const r = await resolverFornecedor(api, 'cli-1', { beneficiary: TRUNCADO, beneficiary_doc: CNPJ })
    expect(r.origem).toBe('erro')
    expect(r.supplier_id).toBeNull()
    expect(r.erro).toMatch(/conexão caiu/)
  })
})
