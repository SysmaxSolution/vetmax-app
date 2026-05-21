// Gera os PNGs fonte para o @capacitor/assets a partir do logo "2 patinhas".
// Saídas em assets/.

import sharp from 'sharp'
import { mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT  = path.join(ROOT, 'assets')

if (!existsSync(OUT)) await mkdir(OUT, { recursive: true })

const WHITE = '#ffffff'
const SLATE_900 = '#0f172a'

// SVG fonte = src/app/icon.svg (mantém uma única fonte de verdade)
const svgSource = await readFile(path.join(ROOT, 'src', 'app', 'icon.svg'), 'utf-8')

// Versão monocromática branca (para splash dark) — substitui todos os fills coloridos por branco
const svgWhite = svgSource
  .replace(/fill="url\(#[^"]+\)"/g, 'fill="#ffffff"')
  .replace(/fill="#[0-9a-fA-F]{6}"/g, 'fill="#ffffff"')

async function rasterize(svg, size, bgColor = null) {
  return await sharp(Buffer.from(svg))
    .resize(size, size, {
      fit: 'contain',
      background: bgColor ? bgColor : { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
}

// 1) icon-only.png (1024) — logo sobre branco edge-to-edge com padding moderado
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } })
  .composite([{ input: await rasterize(svgSource, 760), gravity: 'center' }])
  .png()
  .toFile(path.join(OUT, 'icon-only.png'))

// 2) icon-foreground.png — Android adaptive: ~60% safe zone (transparent bg)
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: await rasterize(svgSource, 640), gravity: 'center' }])
  .png()
  .toFile(path.join(OUT, 'icon-foreground.png'))

// 3) icon-background.png — branco sólido
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } })
  .png()
  .toFile(path.join(OUT, 'icon-background.png'))

// 4) splash.png light — logo grande centralizado sobre branco
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: WHITE } })
  .composite([{ input: await rasterize(svgSource, 800), gravity: 'center' }])
  .png()
  .toFile(path.join(OUT, 'splash.png'))

// 5) splash-dark.png — logo branco sobre slate-900
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: SLATE_900 } })
  .composite([{ input: await rasterize(svgWhite, 800), gravity: 'center' }])
  .png()
  .toFile(path.join(OUT, 'splash-dark.png'))

console.log('Generated:')
for (const f of ['icon-only.png', 'icon-foreground.png', 'icon-background.png', 'splash.png', 'splash-dark.png']) {
  console.log('  assets/' + f)
}
