// Folha fiscal do Livro de Controlados — módulo puro, sem I/O.
//
// Transforma a razão por item (ControlledBook) nas estruturas que a planilha da
// Vigilância usa, para o Excel e o PDF saírem iguais:
//   • uma folha por medicamento: DATA | HISTÓRICO (Pet-Responsável, Procedimento,
//     Nº OS) | MOVIMENTO (Entrada, Saída, Perdas) | ESTOQUE | ASSINATURA | OBS.
//   • Resumo de saldos, Saldo inicial, Perdas e Lançamentos gerais (a tabela
//     cruzada em que a clínica lança tudo de uma vez).

import type { ControlledBook, ControlledItemBook, ControlledLedgerEntry } from '@/types/controlled-book'

export interface LinhaLivro {
  data:            string          // dd/mm/aaaa
  hora:            string          // hh:mm
  pet_responsavel: string
  procedimento:    string
  os:              string
  entrada:         number | null
  saida:           number | null
  perdas:          number | null
  estoque:         number
  observacoes:     string
  responsavel:     string
}

export interface FolhaLivro {
  medicamento:     string
  substancia:      string
  concentracao:    string | null
  classe:          string | null
  unidade:         string
  uso:             'humana' | 'veterinária'
  saldo_anterior:  number
  linhas:          LinhaLivro[]
  total_entradas:  number
  total_saidas:    number
  total_perdas:    number
  saldo_final:     number
}

export interface LinhaResumo {
  medicamento:   string
  unidade:       string
  saldo_inicial: number
  entradas:      number
  saidas:        number
  perdas:        number
  saldo_final:   number
}

export interface LinhaPerda {
  data:        string
  hora:        string
  medicamento: string
  quantidade:  number
  unidade:     string
  motivo:      string
  responsavel: string
  observacoes: string
}

export interface LinhaLancamentoGeral {
  data:         string
  hora:         string
  animal_tutor: string
  procedimento: string
  os:           string
  /** por medicamento: { entrada, saida } */
  valores:      Record<string, { entrada: number; saida: number }>
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

/** dd/mm/aaaa e hh:mm no fuso de Brasília, sem depender do fuso do servidor. */
export function dataHoraBR(iso: string): { data: string; hora: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { data: '', hora: '' }
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const p = (t: string) => partes.find(x => x.type === t)?.value ?? ''
  return { data: `${p('day')}/${p('month')}/${p('year')}`, hora: `${p('hour')}:${p('minute')}` }
}

export function dataBR(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  const [a, m, d] = isoDate.slice(0, 10).split('-')
  return a && m && d ? `${d}/${m}/${a}` : ''
}

/** Nome de aba válido no Excel: até 31 caracteres, sem []:*?/\ */
export function nomeDaAba(nome: string): string {
  const limpo = nome.replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim()
  return (limpo || 'Medicamento').slice(0, 31)
}

export function rotuloMedicamento(item: Pick<ControlledItemBook, 'name' | 'substance'>): string {
  return (item.substance || item.name).trim()
}

/** HISTÓRICO e OBSERVAÇÕES de uma linha, no vocabulário da planilha da clínica. */
export function historicoDaLinha(e: ControlledLedgerEntry): Pick<LinhaLivro, 'pet_responsavel' | 'procedimento' | 'os' | 'observacoes'> {
  const obs: string[] = []
  if (e.batch_number) obs.push(`Lote ${e.batch_number}`)

  if (e.kind === 'saida') {
    const pet = [e.patient_name, e.tutor_name].filter(Boolean).join(' - ')
    if (e.document) obs.push(`Notif. receita ${e.document}`)
    if (!pet && e.reference) obs.push(e.reference)
    return {
      pet_responsavel: pet || (e.origin === 'Venda (PDV)' ? (e.reference ?? 'Venda') : e.origin),
      procedimento:    e.procedure_name ?? (pet ? e.origin : (e.notes ?? '')),
      os:              e.os_number ?? '',
      observacoes:     obs.join(' · '),
    }
  }
  if (e.kind === 'perda') {
    if (e.notes) obs.push(e.notes)
    return {
      pet_responsavel: 'Perda / inutilização',
      procedimento:    e.loss_reason ?? e.reference ?? 'Perda',
      os:              e.os_number ?? '',
      observacoes:     obs.join(' · '),
    }
  }
  // entrada ou ajuste positivo
  if (e.expires_at) obs.push(`val. ${dataBR(e.expires_at)}`)
  const inicial = e.origin === 'Estoque inicial'
  const dentroDeAtendimento = Boolean(e.patient_name || e.os_number)
  if (e.notes && (inicial || !e.counterparty)) obs.push(e.notes)
  const proc = e.counterparty
    ? `${e.counterparty}${e.document ? `, NF ${e.document}` : ''}`
    : inicial ? 'Saldo inicial' : (e.document ? `NF ${e.document}` : (dentroDeAtendimento ? (e.procedure_name ?? e.origin) : (e.kind === 'ajuste' ? 'Ajuste de inventário' : e.origin)))
  return {
    pet_responsavel: dentroDeAtendimento ? [e.patient_name, e.tutor_name].filter(Boolean).join(' - ') : (inicial ? 'Saldo inicial' : 'Entrada'),
    procedimento:    proc,
    os:              e.os_number ?? e.document ?? '',
    observacoes:     obs.join(' · '),
  }
}

export function montarFolha(item: ControlledItemBook): FolhaLivro {
  const linhas: LinhaLivro[] = item.entries.map(e => {
    const { data, hora } = dataHoraBR(e.date)
    const h = historicoDaLinha(e)
    const q = Math.abs(e.quantity)
    return {
      data, hora,
      ...h,
      entrada: e.kind === 'entrada' || (e.kind === 'ajuste' && e.quantity > 0) ? q : null,
      saida:   e.kind === 'saida' ? q : null,
      perdas:  e.kind === 'perda' ? q : null,
      estoque: e.balance,
      responsavel: e.responsible ?? '',
    }
  })
  return {
    medicamento:    item.name,
    substancia:     rotuloMedicamento(item),
    concentracao:   item.concentration,
    classe:         item.control_class,
    unidade:        item.unit ?? 'un',
    uso:            item.is_human_use ? 'humana' : 'veterinária',
    saldo_anterior: item.opening_balance,
    linhas,
    total_entradas: item.total_in,
    total_saidas:   item.total_out,
    total_perdas:   item.total_loss,
    saldo_final:    item.closing_balance,
  }
}

export function todosOsItens(book: ControlledBook): ControlledItemBook[] {
  return [...book.veterinary, ...book.human].sort((a, b) => rotuloMedicamento(a).localeCompare(rotuloMedicamento(b), 'pt-BR'))
}

export function montarResumo(book: ControlledBook): LinhaResumo[] {
  return todosOsItens(book).map(i => ({
    medicamento: rotuloMedicamento(i), unidade: i.unit ?? 'un',
    saldo_inicial: i.opening_balance, entradas: i.total_in, saidas: i.total_out, perdas: i.total_loss, saldo_final: i.closing_balance,
  }))
}

export function montarPerdas(book: ControlledBook): LinhaPerda[] {
  const out: LinhaPerda[] = []
  for (const i of todosOsItens(book)) {
    for (const e of i.entries) {
      if (e.kind !== 'perda') continue
      const { data, hora } = dataHoraBR(e.date)
      out.push({
        data, hora, medicamento: rotuloMedicamento(i), quantidade: Math.abs(e.quantity), unidade: i.unit ?? 'un',
        motivo: e.loss_reason ?? e.reference ?? '', responsavel: e.responsible ?? '',
        observacoes: [e.batch_number ? `Lote ${e.batch_number}` : null, e.notes].filter(Boolean).join(' · '),
      })
    }
  }
  return out.sort((a, b) => a.data.split('/').reverse().join('').localeCompare(b.data.split('/').reverse().join('')) || a.hora.localeCompare(b.hora))
}

/**
 * A tabela cruzada da clínica: uma linha por atendimento (ou por nota de
 * entrada) com um par Entrada/Saída por medicamento. Saldo inicial e perdas
 * ficam fora (têm aba própria), como na planilha.
 */
export function montarLancamentosGerais(book: ControlledBook): { medicamentos: string[]; linhas: LinhaLancamentoGeral[] } {
  const itens = todosOsItens(book)
  const medicamentos = itens.map(rotuloMedicamento)
  const grupos = new Map<string, LinhaLancamentoGeral & { ordem: string }>()
  for (const i of itens) {
    const med = rotuloMedicamento(i)
    for (const e of i.entries) {
      if (e.kind === 'perda' || e.origin === 'Estoque inicial') continue
      const { data, hora } = dataHoraBR(e.date)
      const h = historicoDaLinha(e)
      const chave = [e.date.slice(0, 16), h.os, h.pet_responsavel, h.procedimento].join('|')
      let g = grupos.get(chave)
      if (!g) {
        g = { ordem: e.date, data, hora, animal_tutor: h.pet_responsavel, procedimento: h.procedimento, os: h.os, valores: {} }
        grupos.set(chave, g)
      }
      const v = (g.valores[med] ??= { entrada: 0, saida: 0 })
      if (e.kind === 'saida') v.saida = r3(v.saida + Math.abs(e.quantity))
      else v.entrada = r3(v.entrada + Math.abs(e.quantity))
    }
  }
  const linhas = [...grupos.values()].sort((a, b) => a.ordem.localeCompare(b.ordem)).map(({ ordem: _o, ...l }) => l)
  return { medicamentos, linhas }
}
