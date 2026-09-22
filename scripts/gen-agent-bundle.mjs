import fs from 'node:fs'
import path from 'node:path'
const dir = path.join(process.cwd(), 'lab-agent')
const files = ['agent.mjs','simulate.mjs','package.json','install.ps1','uninstall.ps1','INSTALAR.bat','INSTALACAO.md','README.md']
const map = {}
for (const f of files) {
  const p = path.join(dir, f)
  map[f] = fs.readFileSync(p).toString('base64')
}
const out = `// GERADO por scripts/gen-agent-bundle.mjs — NÃO editar à mão.
// Conteúdo (base64) dos arquivos do agente-ponte, para o endpoint de download
// montar o instalador .zip com o config.json do token. Fonte: lab-agent/.
export const AGENT_BUNDLE: Record<string, string> = ${JSON.stringify(map, null, 2)}
`
fs.writeFileSync(path.join(process.cwd(), 'src/lib/lab/agent-bundle.ts'), out)
console.log('agent-bundle.ts gerado:', Object.keys(map).join(', '), '(', out.length, 'bytes )')
