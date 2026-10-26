// Filtro da lista do PAGFOR (boletos que vieram do banco).
//
// A varredura traz dezenas de boletos de 90 dias; achar "o da Agrofarma que
// vence dia 20" rolando a tabela é o que a Aline pediu para acabar. O filtro
// roda no navegador sobre o que já está carregado e devolve os ÍNDICES das
// linhas, porque seleção, ignorar e vincular são amarrados ao índice original.
//
// Módulo puro, testável.

import type { DdaMatchRow } from '@/types/pagfor'

export type SituacaoFiltro = 'todos' | 'lancados' | 'nao_lancados' | 'agendados' | 'ignorados'

export interface FiltroPagfor {
  /** Nome do beneficiário, nº do documento ou código de barras (sem acento, qualquer caixa). */
  texto:    string
  /** CNPJ/CPF do beneficiário — só os dígitos contam, pode ser parcial. */
  cnpj:     string
  vencDe:   string   // YYYY-MM-DD
  vencAte:  string   // YYYY-MM-DD
  valorMin: string
  valorMax: string
  situacao: SituacaoFiltro
}

export const FILTRO_VAZIO: FiltroPagfor = {
  texto: '', cnpj: '', vencDe: '', vencAte: '', valorMin: '', valorMax: '', situacao: 'todos',
}

export function filtroAtivo(f: FiltroPagfor): boolean {
  return Object.entries(f).some(([k, v]) => (k === 'situacao' ? v !== 'todos' : String(v).trim() !== ''))
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
const numero = (s: string): number | null => {
  const t = s.trim().replace(/\./g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Índices (na ordem original) das linhas que passam no filtro. */
export function filtrarBoletos(
  rows: DdaMatchRow[],
  persistidos: Array<{ dismissed_at?: string | null } | undefined>,
  f: FiltroPagfor,
): number[] {
  const texto = semAcento(f.texto.trim())
  const cnpj = digitos(f.cnpj)
  const min = numero(f.valorMin)
  const max = numero(f.valorMax)
  const de = f.vencDe.trim()
  const ate = f.vencAte.trim()

  const out: number[] = []
  rows.forEach((r, i) => {
    const b = r.boleto
    const ignorado = !!persistidos[i]?.dismissed_at

    if (f.situacao === 'ignorados' && !ignorado) return
    if (f.situacao !== 'ignorados' && f.situacao !== 'todos' && ignorado) return
    if (f.situacao === 'lancados' && r.status !== 'in_system') return
    if (f.situacao === 'nao_lancados' && r.status !== 'not_in_system') return
    if (f.situacao === 'agendados' && !r.entry_scheduled && !r.entry_bank_payment_id) return

    if (texto) {
      const alvo = semAcento([b.beneficiary ?? '', b.document ?? '', b.barcode ?? ''].join(' '))
      if (!alvo.includes(texto)) return
    }
    if (cnpj && !digitos(b.beneficiary_doc).includes(cnpj)) return

    const venc = (b.due_date ?? '').slice(0, 10)
    if (de && (!venc || venc < de)) return
    if (ate && (!venc || venc > ate)) return

    const valor = b.amount ?? 0
    if (min !== null && valor < min - 0.005) return
    if (max !== null && valor > max + 0.005) return

    out.push(i)
  })
  return out
}

/** CNPJ/CPF para a tela: 00.000.000/0000-00 ou 000.000.000-00; devolve o que veio se não for um dos dois. */
export function documentoFormatado(doc: string | null | undefined): string {
  const d = digitos(doc)
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return doc ?? ''
}
