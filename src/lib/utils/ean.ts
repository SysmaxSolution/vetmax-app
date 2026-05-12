/** Retorna true se a string parece um código EAN/UPC (8–14 dígitos) */
export function isEAN(q: string): boolean {
  return /^\d{8,14}$/.test(q.trim())
}
