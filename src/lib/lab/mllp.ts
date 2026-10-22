// MLLP (Minimal Lower Layer Protocol) — enquadramento das mensagens HL7 sobre
// TCP usado pelos analisadores. VT(0x0B) msg FS(0x1C) CR(0x0D). Puro/testável.

export const VT = '\x0b'
export const FS = '\x1c'
export const CR = '\x0d'

/** Enquadra uma mensagem HL7 para envio MLLP. */
export function frameMLLP(message: string): string {
  return VT + message + FS + CR
}

/**
 * Extrai mensagens completas de um buffer de fluxo TCP. Retorna as mensagens
 * fechadas (sem enquadramento) e o resto ainda não terminado.
 */
export function extractMLLP(buffer: string): { messages: string[]; rest: string } {
  const messages: string[] = []
  let rest = buffer
  // Descarta lixo antes do primeiro VT
  const firstVt = rest.indexOf(VT)
  if (firstVt > 0) rest = rest.slice(firstVt)
  let end: number
  while ((end = rest.indexOf(FS + CR)) !== -1) {
    const start = rest.indexOf(VT)
    if (start === -1 || start > end) { rest = rest.slice(end + 2); continue }
    messages.push(rest.slice(start + 1, end))
    rest = rest.slice(end + 2)
    const nextVt = rest.indexOf(VT)
    if (nextVt > 0) rest = rest.slice(nextVt)
  }
  return { messages, rest }
}
