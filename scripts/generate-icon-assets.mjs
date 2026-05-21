// Gera os PNGs fonte para o @capacitor/assets a partir de src/app/icon.svg
//
// Saídas em assets/:
//   icon-only.png        — 1024x1024, logo sobre fundo branco (iOS / fallback Android)
//   icon-foreground.png  — 1024x1024, só o logo com padding (Android adaptive foreground)
//   icon-background.png  — 1024x1024, branco sólido (Android adaptive background)
//   splash.png           — 2732x2732, logo centralizado sobre branco (light)
//   splash-dark.png      — 2732x2732, logo centralizado sobre slate-900 (dark)

import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'assets')

if (!existsSync(OUT)) await mkdir(OUT, { recursive: true })

const TEAL = '#0d9488'
const SLATE_900 = '#0f172a'
const WHITE = '#ffffff'

// Logo SVG (mesma forma de src/app/icon.svg)
const pawSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <ellipse cx="27" cy="32" rx="10" ry="13" fill="${TEAL}" transform="rotate(-18 27 32)"/>
  <ellipse cx="44" cy="23" rx="10" ry="13" fill="${TEAL}" transform="rotate(-6 44 23)"/>
  <ellipse cx="61" cy="23" rx="10" ry="13" fill="${TEAL}" transform="rotate(6 61 23)"/>
  <ellipse cx="78" cy="32" rx="10" ry="13" fill="${TEAL}" transform="rotate(18 78 32)"/>
  <ellipse cx="52" cy="67" rx="26" ry="22" fill="${TEAL}"/>
</svg>`

const pawSvgWhite = pawSvg.replaceAll(TEAL, WHITE)

// 1) Logo PNG em 1024x1024 (sobre transparente) — base de tudo
const pawBuffer = await sharp(Buffer.from(pawSvg))
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

// Logo branco para o splash escuro
const pawWhiteBuffer = await sharp(Buffer.from(pawSvgWhite))
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

// 2) icon-only.png — logo sobre branco, com padding moderado (iOS prefere edge-to-edge)
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: WHITE },
})
  .composite([{
    input: await sharp(pawBuffer).resize(720, 720).toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(path.join(OUT, 'icon-only.png'))

// 3) icon-foreground.png — Android adaptive: ~60% safe zone
// O foreground precisa caber dentro de um círculo de 66dp num canvas de 108dp.
// Em 1024x1024, o logo deve ocupar ~620x620 centralizado.
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{
    input: await sharp(pawBuffer).resize(620, 620).toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(path.join(OUT, 'icon-foreground.png'))

// 4) icon-background.png — branco sólido
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: WHITE },
})
  .png()
  .toFile(path.join(OUT, 'icon-background.png'))

// 5) splash.png light — branco com logo grande centralizado
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: WHITE },
})
  .composite([{
    input: await sharp(pawBuffer).resize(700, 700).toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(path.join(OUT, 'splash.png'))

// 6) splash-dark.png — slate-900 com logo branco
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: SLATE_900 },
})
  .composite([{
    input: await sharp(pawWhiteBuffer).resize(700, 700).toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(path.join(OUT, 'splash-dark.png'))

console.log('Generated:')
for (const f of ['icon-only.png', 'icon-foreground.png', 'icon-background.png', 'splash.png', 'splash-dark.png']) {
  console.log('  assets/' + f)
}
