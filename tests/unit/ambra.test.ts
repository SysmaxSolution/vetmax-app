// Testes do cliente da API v3 da Ambra contra um `fetch` simulado.
//
// O mock reproduz o comportamento REAL que a documentação descreve, e que é
// contraintuitivo em dois pontos:
//
//  1. A Ambra responde **HTTP 200 mesmo quando falha** — o erro vem no corpo,
//     em `error_type`. Um cliente que confiasse no status passaria erro adiante
//     como sucesso.
//  2. A sessão (SID) morre sem aviso e o erro é `NOT_AUTHENTICATED` com 200.
//     A renovação tem que olhar o conteúdo, não o status.
//
// Sem credencial real ainda; isto é o que garante que, quando ela chegar, o que
// falta testar seja só a credencial.

import {
  abrirSessao, buscarEstudoPorAccession, criarLinkVisualizacao,
  registrarWebhook, testarConexao, type CredenciaisAmbra,
} from '@/lib/integrations/ambra'

const CRED: CredenciaisAmbra = {
  base_url: 'https://access.ambrahealth.com',
  login: 'integracao@clinica.test',
  password: 'segredo',
  phi_namespace: 'NS-123',
  account_id: 'ACC-999',
}

type Resposta = { status?: number; corpo: unknown }
let fila: Resposta[] = []
let chamadas: { url: string; corpo: Record<string, unknown> }[] = []

beforeEach(() => {
  fila = []
  chamadas = []
  global.fetch = (async (url: string, init?: RequestInit) => {
    chamadas.push({ url: String(url), corpo: JSON.parse(String(init?.body ?? '{}')) })
    const r = fila.shift() ?? { corpo: { status: 'OK' } }
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      text: async () => JSON.stringify(r.corpo),
    } as Response
  }) as unknown as typeof fetch
})

const loginOk = () => fila.push({ corpo: { status: 'OK', sid: 'SID-1' } })

describe('sessão', () => {
  it('devolve o SID do login', async () => {
    loginOk()
    await expect(abrirSessao(CRED)).resolves.toBe('SID-1')
    expect(chamadas[0].url).toBe('https://access.ambrahealth.com/api/v3/session/login')
    expect(chamadas[0].corpo).toMatchObject({ login: CRED.login, password: CRED.password })
  })

  it('traduz credencial inválida em mensagem acionável', async () => {
    fila.push({ corpo: { error_type: 'INVALID_CREDENTIALS' } })
    await expect(abrirSessao(CRED)).rejects.toThrow(/Login ou senha.*Ambra.*incorretos/i)
  })

  it('trata HTTP 200 com error_type como FALHA, não como sucesso', async () => {
    fila.push({ status: 200, corpo: { error_type: 'ACCOUNT_SUSPENDED' } })
    await expect(abrirSessao(CRED)).rejects.toThrow(/ACCOUNT_SUSPENDED/)
  })

  it('não quebra quando a resposta não é JSON (página de login/proxy)', async () => {
    global.fetch = (async () => ({
      ok: false, status: 502, text: async () => '<html>Bad Gateway</html>',
    } as Response)) as unknown as typeof fetch
    await expect(abrirSessao(CRED)).rejects.toThrow(/502.*sem JSON/i)
  })
})

describe('renovação de sessão', () => {
  it('refaz o login uma vez quando o SID morreu e segue adiante', async () => {
    loginOk()
    fila.push({ corpo: { error_type: 'NOT_AUTHENTICATED' } })  // SID expirou
    loginOk()                                                   // novo login
    fila.push({ corpo: { status: 'OK', studies: [{ uuid: 'U-1' }] } })

    const r = await buscarEstudoPorAccession(CRED, 'ACC-1')
    expect(r?.uuid).toBe('U-1')
    // dois logins + duas tentativas de listagem
    expect(chamadas.filter(c => c.url.endsWith('/session/login'))).toHaveLength(2)
  })

  it('não entra em laço infinito: falha na segunda tentativa', async () => {
    loginOk()
    fila.push({ corpo: { error_type: 'NOT_AUTHENTICATED' } })
    loginOk()
    fila.push({ corpo: { error_type: 'NOT_AUTHENTICATED' } })
    await expect(buscarEstudoPorAccession(CRED, 'ACC-1')).rejects.toThrow(/NOT_AUTHENTICATED/)
    expect(chamadas.filter(c => c.url.endsWith('/session/login'))).toHaveLength(2)
  })
})

describe('busca por accession', () => {
  it('restringe a busca ao phi_namespace da conta', async () => {
    loginOk()
    fila.push({ corpo: { status: 'OK', studies: [] } })
    await buscarEstudoPorAccession(CRED, 'ACC-7')
    const lista = chamadas.find(c => c.url.endsWith('/study/list'))!
    expect(lista.corpo['filter.phi_namespace.equals']).toBe('NS-123')
    expect(lista.corpo['filter.accession_number.equals']).toBe('ACC-7')
  })

  it('omite o filtro de namespace quando a conta não tem um', async () => {
    loginOk()
    fila.push({ corpo: { status: 'OK', studies: [] } })
    await buscarEstudoPorAccession({ ...CRED, phi_namespace: null }, 'ACC-7')
    const lista = chamadas.find(c => c.url.endsWith('/study/list'))!
    expect(lista.corpo).not.toHaveProperty('filter.phi_namespace.equals')
  })

  it('devolve null quando não há estudo', async () => {
    loginOk()
    fila.push({ corpo: { status: 'OK', studies: [] } })
    await expect(buscarEstudoPorAccession(CRED, 'ACC-X')).resolves.toBeNull()
  })

  it('escolhe o MAIS RECENTE quando o accession se repete (exame refeito)', async () => {
    loginOk()
    fila.push({ corpo: { status: 'OK', studies: [
      { uuid: 'ANTIGO', created: '2026-01-10T10:00:00Z' },
      { uuid: 'NOVO',   created: '2026-03-02T08:00:00Z' },
      { uuid: 'MEIO',   created: '2026-02-01T09:00:00Z' },
    ] } })
    const r = await buscarEstudoPorAccession(CRED, 'ACC-DUP')
    expect(r?.uuid).toBe('NOVO')
  })
})

describe('link de visualização', () => {
  it('sempre manda validade e teto de acessos — link eterno em WhatsApp é vazamento', async () => {
    loginOk()
    fila.push({ corpo: { status: 'OK', redirect_url: 'https://ambra/ver/abc' } })

    const antes = Date.now()
    const link = await criarLinkVisualizacao(CRED, 'U-1', {
      minutosDeVida: 60, maxAcessos: 3, notificar: 'gestao@clinica.test',
    })

    const add = chamadas.find(c => c.url.endsWith('/link/add'))!
    expect(add.corpo).toMatchObject({
      action: 'STUDY_VIEW', study_id: 'U-1',
      minutes_alive: 60, max_hits: 3,
      notify: 'gestao@clinica.test',
      skip_email_prompt: 1,
    })
    expect(link.url).toBe('https://ambra/ver/abc')
    // expiração calculada a partir de agora + minutos
    expect(link.expiraEm.getTime()).toBeGreaterThanOrEqual(antes + 60 * 60_000 - 2000)
  })

  it('omite notify quando não há e-mail configurado', async () => {
    loginOk()
    fila.push({ corpo: { status: 'OK', redirect_url: 'https://ambra/ver/x' } })
    await criarLinkVisualizacao(CRED, 'U-1', { minutosDeVida: 10, maxAcessos: 1, notificar: '  ' })
    const add = chamadas.find(c => c.url.endsWith('/link/add'))!
    expect(add.corpo).not.toHaveProperty('notify')
  })

  it('reclama quando a Ambra aceita mas não devolve URL', async () => {
    loginOk()
    fila.push({ corpo: { status: 'OK' } })
    await expect(criarLinkVisualizacao(CRED, 'U-1', { minutosDeVida: 10, maxAcessos: 1 }))
      .rejects.toThrow(/não devolveu a URL/i)
  })
})

describe('registro do webhook', () => {
  it('exige account_id, que só a Ambra informa', async () => {
    await expect(registrarWebhook({ ...CRED, account_id: null }, {
      nome: 'x', urlDestino: 'https://app.test/webhook',
    })).rejects.toThrow(/account_id/)
  })

  it('recusa destino que não seja https', async () => {
    await expect(registrarWebhook(CRED, {
      nome: 'x', urlDestino: 'http://app.test/webhook',
    })).rejects.toThrow(/https/)
  })

  it('usa STUDY_FIRST_IMAGE com disparo único por accession', async () => {
    loginOk()
    fila.push({ corpo: { status: 'OK', uuid: 'WH-1' } })
    const id = await registrarWebhook(CRED, {
      nome: 'SYSVETMAX', urlDestino: 'https://app.test/webhook', regexAccession: '^VM-',
    })
    expect(id).toBe('WH-1')
    const add = chamadas.find(c => c.url.endsWith('/webhook/add'))!
    expect(add.corpo).toMatchObject({
      account_id: 'ACC-999',
      event: 'STUDY_FIRST_IMAGE',
      method: 'POST_JSON',
      once: 1,
      by_accession_number: 1,
      filter_field: 'accession_number',
      filter_regexp: '^VM-',
    })
  })
})

describe('teste de conexão', () => {
  it('devolve ok com a contagem quando a credencial serve', async () => {
    loginOk()
    fila.push({ corpo: { status: 'OK', studies: [{ uuid: 'a' }, { uuid: 'b' }] } })
    await expect(testarConexao(CRED)).resolves.toEqual({ ok: true, estudosVisiveis: 2 })
  })

  it('devolve o erro em vez de estourar — a tela precisa exibir, não quebrar', async () => {
    fila.push({ corpo: { error_type: 'INVALID_CREDENTIALS' } })
    const r = await testarConexao(CRED)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/Login ou senha/i)
  })
})
