// Aplica os ajustes do operador sobre o que foi lido do XML.
//
// O XML continua intacto — ele é o documento fiscal. O que muda aqui é o que
// entra no sistema: a descrição que vai para o estoque, a quantidade
// realmente recebida, o vencimento combinado por fora.
//
// Módulo puro, testável. A regra de ouro: ajuste ausente não altera nada, e
// valor inválido é ignorado em vez de virar zero — zero seria uma afirmação
// errada sobre a compra.

import type { ParsedNFe, ParsedNFeItem, ParsedDuplicata } from '@/lib/utils/nfe-parser'
import type { AjustesDaEntrada } from '@/types/entrada-mercadoria'

const numeroValido = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const textoValido = (v: unknown): string | null => {
  const t = String(v ?? '').trim()
  return t ? t : null
}

export function aplicarAjustes(parsed: ParsedNFe, ajustes?: AjustesDaEntrada): ParsedNFe {
  if (!ajustes) return parsed

  const porItem = new Map((ajustes.itens ?? []).map(a => [a.indice, a]))
  const porDup = new Map((ajustes.duplicatas ?? []).map(a => [a.indice, a]))

  const itens: ParsedNFeItem[] = parsed.items
    .map((item, i) => {
      const a = porItem.get(i)
      if (!a || a.excluir) return a?.excluir ? null : item

      const quantidade = numeroValido(a.quantity) ?? item.quantity
      const unitario = numeroValido(a.unit_price) ?? item.unit_price

      return {
        ...item,
        description: textoValido(a.description) ?? item.description,
        ncm:         textoValido(a.ncm) ?? item.ncm,
        ean:         textoValido(a.ean) ?? item.ean,
        quantity:    quantidade,
        unit_price:  unitario,
        // O total segue quantidade × unitário quando o operador não o informa:
        // deixar o total antigo com a quantidade nova seria incoerente, e é o
        // tipo de erro que só aparece na conferência do estoque.
        total_price: numeroValido(a.total_price)
          ?? Number((quantidade * unitario).toFixed(2)),
      }
    })
    .filter((x): x is ParsedNFeItem => x !== null)

  const duplicatas: ParsedDuplicata[] = (parsed.duplicatas ?? [])
    .map((dup, i) => {
      const a = porDup.get(i)
      if (!a) return dup
      if (a.excluir) return null
      return {
        ...dup,
        vencimento: textoValido(a.vencimento) ?? dup.vencimento,
        valor:      numeroValido(a.valor) ?? dup.valor,
      }
    })
    .filter((x): x is ParsedDuplicata => x !== null)

  return {
    ...parsed,
    items: itens,
    duplicatas,
    // O total do sistema acompanha o que entrou. O total do XML continua
    // registrado no documento; aqui vale o que a clínica recebeu.
    total_value: Number(itens.reduce((s, i) => s + i.total_price, 0).toFixed(2)),
  }
}

/** O que mudou, em uma frase, para registrar no histórico da compra. */
export function resumirAjustes(original: ParsedNFe, ajustado: ParsedNFe): string | null {
  const partes: string[] = []

  const itensRemovidos = original.items.length - ajustado.items.length
  if (itensRemovidos > 0) partes.push(`${itensRemovidos} item(ns) removido(s)`)

  const alterados = ajustado.items.filter((novo, i) => {
    const velho = original.items[i]
    return velho && (
      velho.description !== novo.description ||
      velho.quantity !== novo.quantity ||
      velho.unit_price !== novo.unit_price
    )
  }).length
  if (alterados > 0) partes.push(`${alterados} item(ns) editado(s)`)

  if (Math.round(original.total_value * 100) !== Math.round(ajustado.total_value * 100)) {
    const de = original.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const para = ajustado.total_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    partes.push(`total ${de} → ${para}`)
  }

  return partes.length ? partes.join(' · ') : null
}
