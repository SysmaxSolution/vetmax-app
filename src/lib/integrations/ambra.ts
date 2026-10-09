// Integração com a Ambra (PACS em nuvem) — API v3.
//
// A clínica guarda as imagens de diagnóstico lá. Nós nunca trafegamos nem
// armazenamos DICOM: pedimos à Ambra um LINK do visualizador dela e guardamos
// só esse link. Integração somente leitura.
//
// Referência completa em `integracoes/ambra/api-v3-referencia.html` (baixada de
// access.ambrahealth.com/api/v3/api.html) e o plano em
// `integracoes/ambra/PLANO_CONSTRUCAO_AMBRA_2026-10-09.md`.
//
// Particularidades da API que moldaram este módulo:
//
//  • A sessão é um SID obtido em /session/login e enviado no corpo de cada
//    chamada. Ela expira sem aviso e sem código próprio — o erro vem como
//    `NOT_AUTHENTICATED`/`NOT_AUTHORIZED` na resposta, com HTTP 200. Por isso a
//    renovação é por conteúdo, não por status.
//  • Toda chamada é POST com corpo JSON, inclusive as de consulta.
//  • A resposta traz `status: "OK"` ou um `error_type`; o HTTP nem sempre
//    reflete a falha.

import { mensagemErro } from '@/lib/errors'

export interface CredenciaisAmbra {
  base_url:      string
  login:         string
  password:      string
  phi_namespace: string | null
  account_id:    string | null
}

export interface OpcoesLink {
  /** Minutos de validade do link. */
  minutosDeVida: number
  /** Número máximo de acessos. */
  maxAcessos: number
  /** E-mails avisados a cada uso — é a trilha de quem abriu a imagem. */
  notificar?: string | null
}

export interface LinkVisualizacao {
  url: string
  expiraEm: Date
}

/** Resposta crua: a Ambra devolve `status` e, quando falha, `error_type`. */
interface RespostaAmbra {
  status?:        string
  error_type?:    string
  error_subtype?: string
  [k: string]: unknown
}

const TEMPO_LIMITE_MS = 30_000

/** Erros que significam "a sessão morreu, pegue outro SID". */
const SESSAO_MORTA = new Set(['NOT_AUTHENTICATED', 'NOT_AUTHORIZED', 'INVALID_SID', 'SESSION_EXPIRED'])

function url(cred: CredenciaisAmbra, caminho: string): string {
  return `${cred.base_url.replace(/\/+$/, '')}/api/v3${caminho}`
}

async function chamar(
  cred: CredenciaisAmbra,
  caminho: string,
  corpo: Record<string, unknown>,
): Promise<RespostaAmbra> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TEMPO_LIMITE_MS)
  try {
    const r = await fetch(url(cred, caminho), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    const texto = await r.text()
    let json: RespostaAmbra
    try {
      json = texto ? (JSON.parse(texto) as RespostaAmbra) : {}
    } catch {
      // Corpo não-JSON com HTTP de erro é quase sempre página de login ou
      // proxy. Não adianta repassar HTML ao chamador.
      throw new Error(`Ambra respondeu ${r.status} em ${caminho} sem JSON válido.`)
    }
    if (!r.ok && !json.error_type) {
      throw new Error(`Ambra respondeu ${r.status} em ${caminho}.`)
    }
    return json
  } finally {
    clearTimeout(t)
  }
}

function falhou(res: RespostaAmbra): boolean {
  return !!res.error_type || (res.status !== undefined && res.status !== 'OK')
}

function descricaoDoErro(res: RespostaAmbra, caminho: string): string {
  const tipo = res.error_type ?? res.status ?? 'desconhecido'
  const sub = res.error_subtype ? ` (${res.error_subtype})` : ''
  return `Ambra recusou ${caminho}: ${tipo}${sub}`
}

/**
 * Sessão: faz login e devolve o SID.
 *
 * Não guardamos SID em cache entre requisições de propósito. Em serverless
 * cada invocação pode cair num processo diferente, e um cache que às vezes
 * funciona esconde o caminho de renovação — que é justamente o que quebra em
 * produção às 3h da manhã. O login é uma chamada barata.
 */
export async function abrirSessao(cred: CredenciaisAmbra): Promise<string> {
  const res = await chamar(cred, '/session/login', {
    login: cred.login,
    password: cred.password,
  })
  if (falhou(res) || !res.sid) {
    throw new Error(
      res.error_type === 'INVALID_CREDENTIALS'
        ? 'Login ou senha do usuário de integração da Ambra estão incorretos.'
        : descricaoDoErro(res, '/session/login'),
    )
  }
  return String(res.sid)
}

/** Executa com SID, renovando uma vez se a sessão tiver morrido. */
async function comSessao<T>(
  cred: CredenciaisAmbra,
  fn: (sid: string) => Promise<RespostaAmbra>,
  extrair: (res: RespostaAmbra) => T,
  caminho: string,
): Promise<T> {
  let sid = await abrirSessao(cred)
  let res = await fn(sid)

  if (res.error_type && SESSAO_MORTA.has(res.error_type)) {
    sid = await abrirSessao(cred)
    res = await fn(sid)
  }
  if (falhou(res)) throw new Error(descricaoDoErro(res, caminho))
  return extrair(res)
}

export interface EstudoAmbra {
  uuid:             string
  accessionNumber:  string | null
  studyUid:         string | null
  nomePaciente:     string | null
  criadoEm:         string | null
}

/**
 * Acha o estudo pelo accession que NÓS geramos.
 *
 * É o caminho de reserva: o normal é a Ambra nos avisar por webhook
 * (STUDY_FIRST_IMAGE). Esta consulta existe para webhook perdido,
 * reprocessamento manual e estudo anterior à integração.
 *
 * O `phi_namespace` restringe a busca à conta da clínica — sem ele a API
 * procura em tudo que o usuário enxerga.
 */
export async function buscarEstudoPorAccession(
  cred: CredenciaisAmbra,
  accession: string,
): Promise<EstudoAmbra | null> {
  const filtro: Record<string, unknown> = {
    'filter.accession_number.equals': accession,
    fields: ['uuid', 'accession_number', 'study_uid', 'patient_name', 'created'],
  }
  if (cred.phi_namespace) filtro['filter.phi_namespace.equals'] = cred.phi_namespace

  const lista = await comSessao(
    cred,
    sid => chamar(cred, '/study/list', { sid, ...filtro }),
    res => (Array.isArray(res.studies) ? (res.studies as Record<string, unknown>[]) : []),
    '/study/list',
  )
  if (!lista.length) return null

  // Exame refeito repete o accession. O mais recente é o que vale.
  const ordenada = [...lista].sort((a, b) =>
    String(b.created ?? '').localeCompare(String(a.created ?? '')))
  const e = ordenada[0]

  return {
    uuid:            String(e.uuid),
    accessionNumber: (e.accession_number as string) ?? null,
    studyUid:        (e.study_uid as string) ?? null,
    nomePaciente:    (e.patient_name as string) ?? null,
    criadoEm:        (e.created as string) ?? null,
  }
}

/**
 * Cria o link de visualização de um estudo.
 *
 * `minutes_alive`, `max_hits` e `notify` não são enfeite: o link vai por
 * WhatsApp para tutor e veterinário parceiro. Link eterno e de uso ilimitado
 * circulando em WhatsApp é vazamento de imagem médica esperando acontecer.
 *
 * O link é anônimo — não expõe o usuário de integração —, mas cada acesso fica
 * rastreado do lado da Ambra, e `notify` manda aviso por e-mail a cada uso.
 */
export async function criarLinkVisualizacao(
  cred: CredenciaisAmbra,
  estudoUuid: string,
  opcoes: OpcoesLink,
): Promise<LinkVisualizacao> {
  const corpo: Record<string, unknown> = {
    action:        'STUDY_VIEW',
    study_id:      estudoUuid,
    minutes_alive: opcoes.minutosDeVida,
    max_hits:      opcoes.maxAcessos,
    // Sem isto a Ambra pede o e-mail de quem abriu antes de mostrar a imagem —
    // atrito que o tutor não entende e que o vet parceiro não quer.
    skip_email_prompt: 1,
  }
  if (opcoes.notificar?.trim()) corpo.notify = opcoes.notificar.trim()

  const redirect = await comSessao(
    cred,
    sid => chamar(cred, '/link/add', { sid, ...corpo }),
    res => (res.redirect_url ?? res.url) as string | undefined,
    '/link/add',
  )
  if (!redirect) throw new Error('A Ambra criou o link mas não devolveu a URL de visualização.')

  return {
    url:      String(redirect),
    expiraEm: new Date(Date.now() + opcoes.minutosDeVida * 60_000),
  }
}

/**
 * Registra o webhook que nos avisa quando a primeira imagem do estudo chega.
 *
 * `filter_field` + `filter_regexp` restringem aos estudos cujo accession é
 * nosso; `once` + `by_accession_number` garantem um disparo por exame, mesmo
 * que o aparelho mande as imagens em levas.
 *
 * Idempotente do nosso lado: devolve o id, e quem chama grava para não
 * registrar duas vezes.
 */
export async function registrarWebhook(
  cred: CredenciaisAmbra,
  params: { nome: string; urlDestino: string; evento?: string; regexAccession?: string },
): Promise<string> {
  if (!cred.account_id) {
    throw new Error('Para registrar o webhook a Ambra precisa informar o account_id da conta.')
  }
  if (!params.urlDestino.startsWith('https://')) {
    throw new Error('A URL do webhook precisa ser https.')
  }

  const corpo: Record<string, unknown> = {
    account_id: cred.account_id,
    name:       params.nome,
    event:      params.evento ?? 'STUDY_FIRST_IMAGE',
    url:        params.urlDestino,
    method:     'POST_JSON',
    retry:      1,
    once:       1,
    by_accession_number: 1,
  }
  if (params.regexAccession) {
    corpo.filter_field  = 'accession_number'
    corpo.filter_regexp = params.regexAccession
  }

  return comSessao(
    cred,
    sid => chamar(cred, '/webhook/add', { sid, ...corpo }),
    res => String(res.uuid ?? res.webhook_id ?? ''),
    '/webhook/add',
  )
}

/**
 * Testa a configuração sem efeito colateral: abre sessão e lista um estudo.
 * É o que a tela de configuração chama no botão "Testar conexão".
 */
export async function testarConexao(
  cred: CredenciaisAmbra,
): Promise<{ ok: true; estudosVisiveis: number } | { ok: false; erro: string }> {
  try {
    const filtro: Record<string, unknown> = { fields: ['uuid'] }
    if (cred.phi_namespace) filtro['filter.phi_namespace.equals'] = cred.phi_namespace

    const lista = await comSessao(
      cred,
      sid => chamar(cred, '/study/list', { sid, ...filtro }),
      res => (Array.isArray(res.studies) ? (res.studies as unknown[]) : []),
      '/study/list',
    )
    return { ok: true, estudosVisiveis: lista.length }
  } catch (e) {
    return { ok: false, erro: mensagemErro(e, 'lib/integrations/ambra.ts') }
  }
}
