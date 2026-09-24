// Código de barras Interleaved 2 of 5 (ITF) — padrão do boleto bancário.
// Gera um SVG a partir dos 44 dígitos do código de barras. Puro/testável.

const PATTERNS: Record<string, string> = {
  '0': 'NNWWN', '1': 'WNNNW', '2': 'NWNNW', '3': 'WWNNN', '4': 'NNWNW',
  '5': 'WNWNN', '6': 'NWWNN', '7': 'NNNWW', '8': 'WNNWN', '9': 'NWNWN',
}

/** Sequência de barras/espaços (largura em módulos) do ITF para os dígitos. */
export function itfModules(digits: string): { width: number; bar: boolean }[] {
  let s = (digits ?? '').replace(/\D/g, '')
  if (s.length % 2 !== 0) s = '0' + s   // ITF exige par
  const NARROW = 1, WIDE = 3
  const out: { width: number; bar: boolean }[] = []
  // start: barra-fina, espaço-fino, barra-fina, espaço-fino
  out.push({ width: NARROW, bar: true }, { width: NARROW, bar: false }, { width: NARROW, bar: true }, { width: NARROW, bar: false })
  for (let i = 0; i < s.length; i += 2) {
    const a = PATTERNS[s[i]], b = PATTERNS[s[i + 1]]
    for (let k = 0; k < 5; k++) {
      out.push({ width: a[k] === 'W' ? WIDE : NARROW, bar: true })   // dígito 1 → barras
      out.push({ width: b[k] === 'W' ? WIDE : NARROW, bar: false })  // dígito 2 → espaços
    }
  }
  // stop: barra-larga, espaço-fino, barra-fina
  out.push({ width: WIDE, bar: true }, { width: NARROW, bar: false }, { width: NARROW, bar: true })
  return out
}

/** SVG do código de barras (barras pretas sobre fundo branco). */
export function barcodeSvg(digits: string, opts?: { moduleWidth?: number; height?: number }): string {
  const mw = opts?.moduleWidth ?? 1
  const h = opts?.height ?? 50
  const mods = itfModules(digits)
  const total = mods.reduce((s, m) => s + m.width, 0) * mw
  let x = 0
  const rects: string[] = []
  for (const m of mods) {
    const w = m.width * mw
    if (m.bar) rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${h}" fill="#000"/>`)
    x += w
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total.toFixed(2)}" height="${h}" viewBox="0 0 ${total.toFixed(2)} ${h}" preserveAspectRatio="none">${rects.join('')}</svg>`
}
