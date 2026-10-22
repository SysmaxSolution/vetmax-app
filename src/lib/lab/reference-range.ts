// Leitura da faixa de referência escrita pela clínica.
//
// A clínica digita a faixa como ela imprime no laudo — "5,5 A 8,5 milhões/mm³",
// "200 a 500 mil/mm³", "0 %". O texto é preservado tal e qual; daqui saem só os
// limites numéricos, que servem para marcar H/L. Se não der para entender, o
// laudo imprime o texto e não marca nada — melhor sem marca do que com marca
// errada num documento clínico.
//
// Fica fora dos módulos 'use server' de propósito: função síncrona exportada
// de um arquivo de Server Actions quebra o build.

export interface Faixa { low: number | null; high: number | null }

export function parseFaixa(txt: string | null | undefined): Faixa {
  if (!txt) return { low: null, high: null }
  const s = String(txt)

  // "5,5 A 8,5 …", "200 a 500 …", "0.5~1.5", "10-88", "2 até 10"
  const par = s.match(/(-?\d+(?:[.,]\d+)?)\s*(?:[Aa]|~|-|até|ATÉ)\s*(-?\d+(?:[.,]\d+)?)/)
  if (par) {
    return { low: num(par[1]), high: num(par[2]) }
  }

  // Um número sozinho ("0 %") = teto. É como a Animais escreve os analitos que
  // não deveriam aparecer (mielócitos, linfócitos atípicos).
  const unico = s.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*\D*$/)
  return unico ? { low: null, high: num(unico[1]) } : { low: null, high: null }
}

const num = (v: string) => {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
