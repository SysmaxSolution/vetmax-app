/**
 * Helpers de formatação inline parcial e listas para TextElement.
 *
 * Markdown simples (suporte só ao essencial — sem links/imagens/headers):
 *   **negrito**        → <strong>
 *   *italico*          → <em>
 *   __sublinhado__     → <u>
 *   ~~taxado~~         → <s>
 *
 * Segurança: faz HTML escape antes do parse. Só os 4 padrões reconhecidos
 * são convertidos em tags. Texto livre do admin não pode injetar HTML
 * arbitrário (XSS mitigado).
 */

import type { TextListStyle } from './elements'

/** Escape HTML — < > & " ' viram entidades. Sempre executar antes do parse. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Converte sintaxe markdown leve em HTML seguro. Aceita os 4 padrões.
 *  Ordem importa: **bold** antes de *italic* (senão *bold* fica como italic).
 *
 *  NÃO converte \\n para <br> — quebras de linha são preservadas via
 *  white-space: pre-line no container. Motivo: browsers tratam texto antes
 *  de <br> como "última linha" e left-alinham mesmo com text-align: justify.
 *  Com pre-line + \\n natural, cada linha lógica respeita o text-align. */
export function parseInlineMarkdown(text: string): string {
  if (!text) return ''
  let html = escapeHtml(text)
  // **negrito** (precisa vir antes do *italico*)
  html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
  // *italico* — não consome ** (lookbehind/lookahead negativos)
  html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
  // __sublinhado__
  html = html.replace(/__([^_\n]+?)__/g, '<u>$1</u>')
  // ~~taxado~~
  html = html.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>')
  return html
}

/** Retorna o prefixo de cada item da lista (1., •, –, →, ✓, emoji). */
export function getListPrefix(style: TextListStyle, index: number, customChar?: string): string {
  switch (style) {
    case 'decimal': return `${index}.`
    case 'bullet':  return '•'
    case 'dash':    return '–'
    case 'arrow':   return '→'
    case 'check':   return '✓'
    case 'custom':  return (customChar?.trim() || '•')
    case 'none':
    default:        return ''
  }
}

/** Divide o content em tópicos (uma linha = um tópico não-vazio). */
export function splitIntoTopics(content: string): string[] {
  return content.split('\n').map(l => l.trim()).filter(Boolean)
}

/**
 * Envolve a seleção atual do textarea com prefix/suffix (ex: dois asteriscos).
 * Se nada selecionado, insere os marcadores na posição do cursor com um
 * placeholder entre eles, depois posiciona o cursor no placeholder para
 * o usuário substituir.
 */
export function wrapTextareaSelection(
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix: string,
  placeholder = 'texto',
): { value: string; selectionStart: number; selectionEnd: number } {
  const value = textarea.value
  const start = textarea.selectionStart ?? value.length
  const end = textarea.selectionEnd ?? value.length
  const selected = value.slice(start, end)

  if (selected) {
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
    return {
      value: next,
      selectionStart: start + prefix.length,
      selectionEnd: start + prefix.length + selected.length,
    }
  }
  // Sem seleção — insere placeholder selecionável
  const next = value.slice(0, start) + prefix + placeholder + suffix + value.slice(end)
  return {
    value: next,
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length + placeholder.length,
  }
}
