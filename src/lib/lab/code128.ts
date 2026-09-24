// Codificador Code 128 (subset B) puro → larguras de barras para SVG.
// Padrão universal de etiquetas de tubo de coleta (leitores 1D). Testável.

// Tabela canônica de padrões (índice = valor 0..106). Cada string = larguras
// alternando barra/espaço, começando por barra. 106 = STOP (7 larguras).
const PATTERNS: string[] = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
]

const START_B = 104
const STOP = 106

export interface Code128Encoding {
  widths:   number[]   // larguras alternando barra/espaço (índice par = barra)
  check:    number     // dígito verificador (mod 103)
  modules:  number     // total de módulos (soma das larguras)
}

/** Codifica uma string (ASCII imprimível 32..126) em Code 128-B. */
export function encodeCode128B(data: string): Code128Encoding | { error: string } {
  if (!data) return { error: 'Conteúdo vazio.' }
  const values: number[] = []
  for (const ch of data) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code > 126) return { error: `Caractere não suportado no Code128-B: "${ch}"` }
    values.push(code - 32)
  }
  let sum = START_B
  values.forEach((v, i) => { sum += v * (i + 1) })
  const check = sum % 103
  const symbols = [START_B, ...values, check, STOP]
  const widths: number[] = []
  for (const s of symbols) for (const d of PATTERNS[s]) widths.push(Number(d))
  return { widths, check, modules: widths.reduce((a, b) => a + b, 0) }
}
