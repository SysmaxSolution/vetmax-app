import { mensagemErro } from '@/lib/errors'

// Os códigos e textos abaixo foram MEDIDOS contra o Supabase de testes
// (claqxwckiihknclhmzvf) em 2026-10-07, não inventados. Ver o comentário no
// topo de src/lib/errors.ts.

describe('mensagemErro — nossas exceções passam inteiras', () => {
  // RAISE EXCEPTION sem ERRCODE e com ERRCODE='P0001' chegam os dois como P0001.
  const nossas = [
    'Apenas gestores podem cancelar parcelas.',
    'Valor bruto deve ser maior que zero.',
    'Acesso negado ao dashboard do caixa',
    'Only receptionist/admin can check-in',        // sem acento: ainda é nossa
    'Apenas parcelas pendentes podem ser editadas (status atual: paid).',
  ]
  it.each(nossas)('P0001 devolve o texto: %s', (msg) => {
    expect(mensagemErro({ code: 'P0001', message: msg })).toBe(msg)
  })
})

describe('mensagemErro — erro do motor nunca vaza estrutura', () => {
  const motor: [string, string][] = [
    ['42P01', 'relation "tabela_x" does not exist'],
    ['42703', 'column "coluna_x" does not exist'],
    ['42883', 'function funcao_x() does not exist'],
    ['22P02', 'invalid input syntax for type uuid: "nao-e-uuid"'],
    ['23502', 'null value in column "bucket" of relation "api_rate_limits" violates not-null constraint'],
    ['23505', 'duplicate key value violates unique constraint "api_rate_limits_pkey"'],
    ['42501', 'permission denied for table clinic_bank_certificates'],
    ['PGRST205', "Could not find the table 'public.patients' in the schema cache"],
  ]
  it.each(motor)('%s não devolve o texto cru', (code, msg) => {
    const saida = mensagemErro({ code, message: msg })
    expect(saida).not.toBe(msg)
    // e não carrega nenhum nome de objeto do banco
    expect(saida).not.toMatch(/relation|column|constraint|schema cache|api_rate_limits|clinic_bank_certificates|patients/i)
  })

  it('traduz os códigos que valem explicação própria', () => {
    expect(mensagemErro({ code: '23505', message: 'duplicate key...' })).toMatch(/já existe/i)
    expect(mensagemErro({ code: '23502', message: 'null value...' })).toMatch(/obrigatório/i)
    expect(mensagemErro({ code: '42501', message: 'permission denied...' })).toMatch(/permissão/i)
    expect(mensagemErro({ code: 'PGRST116', message: 'no rows' })).toMatch(/não encontrado/i)
  })
})

describe('mensagemErro — erro nosso de TypeScript, sem SQLSTATE', () => {
  const nossas = [
    'Sicoob: Falha no token Sicoob (401): invalid_client',
    'Certificado digital não confere com o CNPJ da empresa.',
    'Nenhum resultado liberado para este exame.',
  ]
  it.each(nossas)('passa: %s', (msg) => {
    expect(mensagemErro({ message: msg })).toBe(msg)
  })

  it('mas segura o que cheira a mensagem do motor mesmo sem código', () => {
    const msg = 'relation "financial_entries" does not exist'
    expect(mensagemErro({ message: msg })).not.toBe(msg)
  })
})

describe('mensagemErro — entradas degeneradas não quebram', () => {
  it.each([null, undefined, {}, { code: 'P0001' }, { message: '' }, 'string solta', 42])(
    'não lança nem devolve vazio: %p',
    (entrada) => {
      const saida = mensagemErro(entrada)
      expect(typeof saida).toBe('string')
      expect(saida.length).toBeGreaterThan(0)
    },
  )
})
