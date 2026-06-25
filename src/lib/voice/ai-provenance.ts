// Proveniência do prontuário (Frente 1 / council 2026-06-24).
//
// O texto ditado por voz no Consultório pode ser literal (o que o MV falou) ou
// INFERIDO pela IA (SOAP parafraseado). Para o MV distinguir e validar o que a
// IA escreveu em nome dele antes de assinar o prontuário, os trechos inferidos
// são delimitados por marcadores. Ao revisar, os marcadores são removidos
// (o texto passa a ser prontuário validado). A finalização (completed) deve
// travar enquanto existir trecho não revisado.
export const AI_BLOCK_OPEN = '⟦ IA · revisar ⟧'
export const AI_BLOCK_CLOSE = '⟦ fim IA ⟧'

/** Envolve um trecho inferido pela IA com os marcadores de proveniência. */
export function wrapAiBlock(text: string): string {
  return `${AI_BLOCK_OPEN}\n${text}\n${AI_BLOCK_CLOSE}`
}

/** Há trechos inferidos pela IA ainda não revisados pelo MV no prontuário? */
export function hasUnreviewedAiText(notes: string): boolean {
  return notes.includes(AI_BLOCK_OPEN)
}

/**
 * Remove os marcadores de proveniência (MV revisou): o conteúdo permanece, os
 * delimitadores somem e o excesso de linhas em branco é normalizado.
 */
export function stripAiBlocks(notes: string): string {
  return notes
    .split(AI_BLOCK_OPEN).join('')
    .split(AI_BLOCK_CLOSE).join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
