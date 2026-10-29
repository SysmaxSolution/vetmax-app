// Janelas de fechamento do convênio (Fase 1 · item 1.9).
//
// Módulo PURO, sem I/O e sem `Date` com fuso: datas entram e saem como
// 'YYYY-MM-DD'. Usar `new Date('2026-10-17')` e somar dias leva a erro de um dia
// conforme o fuso da máquina — e o fechamento de convênio é dinheiro com data de
// competência. Toda a aritmética aqui é feita em números de dia do calendário
// proléptico gregoriano, sem passar por fuso nenhum.

/** Periodicidade do fechamento, igual ao CHECK de `insurance_providers.repass_cycle`. */
export type CicloRepasse = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface JanelaFechamento {
  /** Primeiro dia do período, 'YYYY-MM-DD'. */
  inicio: string
  /** Último dia do período, 'YYYY-MM-DD' (inclusivo). */
  fim: string
  /** Rótulo para a tela: "Outubro/2026", "06/10 a 12/10", "17/10/2026". */
  rotulo: string
}

export const ROTULO_CICLO: Record<CicloRepasse, string> = {
  daily:   'Diário',
  weekly:  'Semanal',
  monthly: 'Mensal',
  custom:  'Por período',
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// ─── aritmética de calendário sem fuso ──────────────────────────────────────

function partes(iso: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return { ano, mes, dia }
}

function iso(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function diasNoMes(ano: number, mes: number): number {
  return [31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1]
}

function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
}

/** Dia sequencial desde 1970-01-01, para somar e subtrair dias com segurança. */
function paraDiaSerial(isoData: string): number {
  const { ano, mes, dia } = partes(isoData)
  let total = 0
  for (let a = 1970; a < ano; a++) total += bissexto(a) ? 366 : 365
  for (let m = 1; m < mes; m++) total += diasNoMes(ano, m)
  return total + dia - 1
}

function deDiaSerial(serial: number): string {
  let ano = 1970
  let resto = serial
  for (;;) {
    const noAno = bissexto(ano) ? 366 : 365
    if (resto < noAno) break
    resto -= noAno
    ano++
  }
  let mes = 1
  for (;;) {
    const noMes = diasNoMes(ano, mes)
    if (resto < noMes) break
    resto -= noMes
    mes++
  }
  return iso(ano, mes, resto + 1)
}

export function somarDias(isoData: string, dias: number): string {
  return deDiaSerial(paraDiaSerial(isoData) + dias)
}

/** 0 = domingo … 6 = sábado. 1970-01-01 foi uma quinta-feira (4). */
export function diaDaSemana(isoData: string): number {
  return (((paraDiaSerial(isoData) + 4) % 7) + 7) % 7
}

function formatarDiaMes(isoData: string): string {
  const { mes, dia } = partes(isoData)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

function formatarCompleto(isoData: string): string {
  const { ano, mes, dia } = partes(isoData)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`
}

// ─── janelas ────────────────────────────────────────────────────────────────

/**
 * Janela que contém `referencia` — o período corrente, ainda aberto.
 *
 * - diário: o próprio dia.
 * - semanal: a semana que começa no `diaRef` (0=domingo). Sem `diaRef`, começa
 *   no domingo.
 * - mensal: quando `diaRef` é 1 ou nulo, o mês civil. Com outro `diaRef`, o
 *   ciclo vai do dia `diaRef` de um mês ao dia anterior no mês seguinte — é o
 *   caso de quem fecha "do dia 15 ao dia 14". Mês curto trava no último dia.
 * - custom: devolve o próprio dia; a janela é escolhida à mão na tela.
 */
export function janelaDoCiclo(
  ciclo: CicloRepasse,
  diaRef: number | null | undefined,
  referencia: string,
): JanelaFechamento {
  if (ciclo === 'daily' || ciclo === 'custom') {
    return { inicio: referencia, fim: referencia, rotulo: formatarCompleto(referencia) }
  }

  if (ciclo === 'weekly') {
    const comeca = diaRef === null || diaRef === undefined ? 0 : diaRef
    const atual = diaDaSemana(referencia)
    const recuo = (((atual - comeca) % 7) + 7) % 7
    const inicio = somarDias(referencia, -recuo)
    const fim = somarDias(inicio, 6)
    return { inicio, fim, rotulo: `${formatarDiaMes(inicio)} a ${formatarDiaMes(fim)}` }
  }

  // mensal
  const { ano, mes, dia } = partes(referencia)
  const corte = diaRef === null || diaRef === undefined ? 1 : diaRef

  if (corte === 1) {
    const inicio = iso(ano, mes, 1)
    const fim = iso(ano, mes, diasNoMes(ano, mes))
    return { inicio, fim, rotulo: `${MESES[mes - 1]}/${ano}` }
  }

  // Ciclo que vira o mês: começa no `corte` do mês corrente se já passamos dele,
  // senão no `corte` do mês anterior.
  let anoIni = ano
  let mesIni = mes
  if (dia < Math.min(corte, diasNoMes(ano, mes))) {
    mesIni = mes - 1
    if (mesIni === 0) { mesIni = 12; anoIni = ano - 1 }
  }
  const diaIni = Math.min(corte, diasNoMes(anoIni, mesIni))
  const inicio = iso(anoIni, mesIni, diaIni)

  let anoFim = anoIni
  let mesFim = mesIni + 1
  if (mesFim === 13) { mesFim = 1; anoFim = anoIni + 1 }
  const diaProximoCorte = Math.min(corte, diasNoMes(anoFim, mesFim))
  const fim = somarDias(iso(anoFim, mesFim, diaProximoCorte), -1)

  return { inicio, fim, rotulo: `${formatarDiaMes(inicio)} a ${formatarDiaMes(fim)}` }
}

/**
 * Janela anterior à que contém `referencia` — na prática, o período a fechar,
 * já encerrado.
 */
export function janelaAnterior(
  ciclo: CicloRepasse,
  diaRef: number | null | undefined,
  referencia: string,
): JanelaFechamento {
  const atual = janelaDoCiclo(ciclo, diaRef, referencia)
  return janelaDoCiclo(ciclo, diaRef, somarDias(atual.inicio, -1))
}

/**
 * As `quantidade` janelas mais recentes, da mais nova para a mais antiga,
 * começando pela que contém `referencia`. Alimenta o seletor de período da tela
 * de fechamento, para ninguém precisar digitar data.
 */
export function ultimasJanelas(
  ciclo: CicloRepasse,
  diaRef: number | null | undefined,
  referencia: string,
  quantidade = 6,
): JanelaFechamento[] {
  const lista: JanelaFechamento[] = []
  let cursor = referencia
  for (let i = 0; i < quantidade; i++) {
    const janela = janelaDoCiclo(ciclo, diaRef, cursor)
    lista.push(janela)
    cursor = somarDias(janela.inicio, -1)
  }
  return lista
}
