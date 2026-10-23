import { mensagemParaOperador, textoParaTela } from '@/lib/financial/mensagens-operador'

// As mensagens reais que as actions devolvem hoje. Se alguma voltar a vazar
// termo técnico para a tela do operador, este teste quebra.
const MENSAGENS_REAIS = [
  'Produção exige o certificado e-CNPJ A1 da empresa desta conta. Envie o arquivo .pfx em Configurações > Financeiro.',
  'Não foi possível decifrar o certificado guardado. Envie o arquivo novamente.',
  'O certificado e-CNPJ venceu em 11/12/2026. Renove para voltar a buscar o extrato.',
  'A integração bancária não está ativada para esta clínica (Configurações > Financeiro).',
  'Nenhum banco configurado corresponde a esta conta. Confira agência e conta em Configurações > Financeiro.',
  'Nenhuma conta Sicoob cadastrada (Cadastros → Bancos).',
  'Conta ou agência sem número no cadastro (Cadastros → Bancos).',
  'fetch failed',
  'HTTP 500: {"error":"internal"}',
  'getaddrinfo ENOTFOUND api.sicoob.com.br',
]

const TERMOS_PROIBIDOS =
  /\.pfx|e-cnpj|client_id|certificad|mTLS|TLS|HTTP \d|ENOTFOUND|fetch failed|sandbox|stack|undefined|null/i

describe('mensagemParaOperador', () => {
  it('nenhuma mensagem real vaza termo técnico para a tela', () => {
    for (const bruta of MENSAGENS_REAIS) {
      expect(textoParaTela(bruta)).not.toMatch(TERMOS_PROIBIDOS)
    }
  })

  it('nenhuma mensagem real manda o operador mexer em configuração', () => {
    for (const bruta of MENSAGENS_REAIS) {
      expect(textoParaTela(bruta)).not.toMatch(/Configurações|Cadastros|Envie o arquivo|Renove/i)
    }
  })

  it('problema de configuração aponta para quem resolve', () => {
    const m = mensagemParaOperador('Produção exige o certificado e-CNPJ A1 da empresa desta conta.')
    expect(m.chamarAdmin).toBe(true)
    expect(textoParaTela('Produção exige o certificado e-CNPJ A1 da empresa.'))
      .toMatch(/administrador/i)
  })

  it('sessão e permissão falam direto com quem está na tela', () => {
    expect(mensagemParaOperador('Não autenticado.').chamarAdmin).toBe(false)
    expect(mensagemParaOperador('Não autenticado.').texto).toMatch(/sessão expirou/i)
    expect(mensagemParaOperador('Sem permissão.').texto).toMatch(/permissão/i)
  })

  it('falha de rede vira a frase genérica, nunca o erro cru', () => {
    for (const rede of ['fetch failed', 'getaddrinfo ENOTFOUND api.sicoob.com.br', 'socket hang up']) {
      const t = textoParaTela(rede)
      expect(t).toMatch(/não foi possível falar com o banco/i)
      expect(t).not.toMatch(TERMOS_PROIBIDOS)
    }
  })

  it('vazio não vira mensagem de erro', () => {
    expect(textoParaTela('')).toBe('')
    expect(textoParaTela(null)).toBe('')
    expect(textoParaTela(undefined)).toBe('')
  })

  it('integração desligada diz o que está desligado', () => {
    const t = textoParaTela('A integração bancária não está ativada para esta clínica (Configurações > Financeiro).')
    expect(t).toMatch(/não está ativa/i)
    expect(t).toMatch(/administrador/i)
    expect(t).not.toMatch(/Configurações/)
  })
})
