// Gera os PNGs fonte para o @capacitor/assets a partir da logo oficial
// (assets/brand-logo.png — 1024x1024 enviado pelo PO).
//
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

const WHITE     = '#ffffff'
const SLATE_900 = '#0f172a'

// Logo oficial — patinha verde + ECG azul marinho em moldura circular metálica.
const logoBuffer = await readFile(path.join(ROOT, 'assets', 'brand-logo.png'))

// 1) icon-only.png (1024) — usa a logo completa como está. iOS exibe full-bleed.
await sharp(logoBuffer).resize(1024, 1024, { fit: 'contain', background: WHITE }).png()
  .toFile(path.join(OUT, 'icon-only.png'))

// 2) icon-foreground.png — adaptive Android: precisa de ~28% padding pra logo
// caber dentro do recorte circular do launcher. Logo embebida num canvas
// transparente, escalada para 720x720 (≈70% do canvas) e centralizada.
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{
    input: await sharp(logoBuffer).resize(720, 720, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(path.join(OUT, 'icon-foreground.png'))

// 3) icon-background.png — branco sólido (combina com a moldura clara da logo).
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } })
  .png()
  .toFile(path.join(OUT, 'icon-background.png'))

// 4) splash.png light — logo centralizada sobre branco.
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: WHITE } })
  .composite([{
    input: await sharp(logoBuffer).resize(900, 900, { fit: 'contain' }).png().toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(path.join(OUT, 'splash.png'))

// 5) splash-dark.png — logo centralizada sobre slate-900.
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: SLATE_900 } })
  .composite([{
    input: await sharp(logoBuffer).resize(900, 900, { fit: 'contain' }).png().toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(path.join(OUT, 'splash-dark.png'))

console.log('Generated from assets/brand-logo.png:')
for (const f of ['icon-only.png', 'icon-foreground.png', 'icon-background.png', 'splash.png', 'splash-dark.png']) {
  console.log('  assets/' + f)
}
