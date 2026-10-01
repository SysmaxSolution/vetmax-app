// Monta a pasta PRONTA para atualizar o agente-ponte já instalado na clínica.
//
// Contexto: a atualização é feita por AnyDesk, onde copiar/colar comando longo
// quebra. Então entregamos ARQUIVOS, não comandos: o Diretor copia a pasta de
// uma vez e dá duplo-clique no ATUALIZAR.bat.
//
// Uso:
//   node scripts/make-agent-update-kit.mjs                 # -> C:\atualiza-agente
//   node scripts/make-agent-update-kit.mjs --out D:\kit
//
// Nada de token aqui: o config.json da clínica NÃO é tocado nem copiado.

import { mkdirSync, copyFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __d = dirname(fileURLToPath(import.meta.url))
const src = resolve(__d, '../lab-agent')
const argv = process.argv.slice(2)
const i = argv.indexOf('--out')
const out = i >= 0 ? argv[i + 1] : 'C:/atualiza-agente'

const FILES = ['agent.mjs', 'atualizar.ps1', 'ATUALIZAR.bat', 'ATUALIZACAO.md', 'simulate.mjs']

if (existsSync(out)) rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

for (const f of FILES) {
  const from = join(src, f)
  if (!existsSync(from)) { console.error('faltando em lab-agent/:', f); process.exit(1) }
  copyFileSync(from, join(out, f))
  console.log(`  ${f.padEnd(16)} ${readFileSync(from).length} bytes`)
}

console.log('')
console.log('Kit pronto em:', out)
console.log('Copie a pasta inteira para o PC do laboratório e dê duplo-clique em ATUALIZAR.bat.')
console.log('NÃO copie config.json nem node.exe — os que já estão lá continuam valendo.')
