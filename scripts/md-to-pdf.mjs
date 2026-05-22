// Converte um arquivo .md em PDF usando playwright + marked (via CDN).
// Uso: node scripts/md-to-pdf.mjs <input.md> <output.pdf>

import { readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { chromium } from 'playwright'

const [,, inPath, outPath] = process.argv
if (!inPath || !outPath) {
  console.error('uso: node scripts/md-to-pdf.mjs <input.md> <output.pdf>')
  process.exit(1)
}

const md = readFileSync(inPath, 'utf8')
// Encode como JSON para inserir como string segura no HTML
const mdJson = JSON.stringify(md)

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Manual</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #1e293b;
    max-width: 100%;
  }
  h1 { font-size: 22pt; color: #0c4a6e; margin: 0 0 8px 0; border-bottom: 3px solid #0ea5e9; padding-bottom: 6px; }
  h2 { font-size: 16pt; color: #0c4a6e; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  h3 { font-size: 13pt; color: #075985; margin-top: 20px; margin-bottom: 6px; }
  h4 { font-size: 11.5pt; color: #0369a1; margin-top: 14px; margin-bottom: 4px; }
  p { margin: 6px 0; }
  strong { color: #0c4a6e; }
  code {
    background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
    font-family: 'SF Mono', Consolas, monospace; font-size: 9.5pt;
    color: #be185d;
  }
  pre {
    background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 8px;
    overflow-x: auto; font-family: 'SF Mono', Consolas, monospace; font-size: 9pt;
    line-height: 1.5;
  }
  pre code { background: transparent; color: inherit; padding: 0; font-size: inherit; }
  ul, ol { padding-left: 22px; margin: 6px 0; }
  li { margin: 3px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10pt; }
  th { background: #0ea5e9; color: white; padding: 8px 10px; text-align: left; font-weight: 600; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  blockquote {
    border-left: 4px solid #0ea5e9; padding: 6px 14px; margin: 10px 0;
    background: #f0f9ff; color: #0c4a6e; font-style: italic;
    border-radius: 0 6px 6px 0;
  }
  hr { border: none; border-top: 2px dashed #cbd5e1; margin: 24px 0; }
  a { color: #0284c7; text-decoration: none; }
  .footer {
    margin-top: 30px; padding-top: 8px; border-top: 1px solid #e2e8f0;
    font-size: 8.5pt; color: #94a3b8; text-align: center;
  }
</style>
</head>
<body>
<div id="content"></div>
<script>
  const md = ${mdJson};
  marked.setOptions({ gfm: true, breaks: false });
  document.getElementById('content').innerHTML = marked.parse(md);
  document.title = 'Manual VetMax · Petlove Inteligente';
</script>
</body>
</html>`

const htmlPath = join(tmpdir(), `md-to-pdf-${Date.now()}.html`)
writeFileSync(htmlPath, html, 'utf8')

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
await page.goto('file://' + htmlPath.replace(/\\/g, '/'))
await page.waitForFunction(() => document.getElementById('content')?.innerHTML?.length > 100)
await page.pdf({
  path: resolve(outPath),
  format: 'A4',
  margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
  printBackground: true,
})
await browser.close()
console.log('✅ PDF gerado:', resolve(outPath))
