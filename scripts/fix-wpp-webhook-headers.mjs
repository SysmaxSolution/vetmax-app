// Reconfigura os webhooks das instâncias Evolution para enviar o header `apikey`
// exigido pelo endpoint do VetMax (commit 03c1a90a). Sem isso → 401 → bot morto.
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const VETMAX_KEY = env.match(/^EVOLUTION_API_KEY=(.+)$/m)[1].trim().replace(/^"|"$/g, '')
const ADMIN_KEY  = (process.env.ADMIN_KEY || '').trim()
const EVO = 'https://wpp.sysmaxsolutions.com'

if (!ADMIN_KEY) { console.error('ADMIN_KEY ausente no ambiente'); process.exit(1) }

// instância → clinicId (para montar a URL do webhook)
const INSTANCES = [
  { name: 'vet218e5d8f', clinicId: '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae', label: 'Almavet' },
  { name: 'vet06fd6aca', clinicId: '06fd6aca-0f80-45ac-a552-220af5a242ae', label: 'Vet Teste' },
  { name: 'vet143b324f', clinicId: null, label: 'Saulo (143b324f)' },
]

const EVENTS = ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT']

async function setWebhook(inst) {
  if (!inst.clinicId) { console.log(`  · ${inst.label}: clinicId desconhecido — pulando`); return }
  const url = `${EVO}/api/webhooks/whatsapp/${inst.clinicId}`.replace('wpp.sysmaxsolutions.com', 'sysvetmax.sysmaxsolutions.com')
  const body = {
    webhook: {
      enabled: true,
      url,
      headers: { apikey: VETMAX_KEY, 'Content-Type': 'application/json' },
      byEvents: false,
      base64: false,
      events: EVENTS,
    },
  }
  const res = await fetch(`${EVO}/webhook/set/${inst.name}`, {
    method: 'POST',
    headers: { apikey: ADMIN_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const txt = await res.text()
  console.log(`  · ${inst.label} (${inst.name}): HTTP ${res.status} ${res.ok ? 'OK' : txt.slice(0,200)}`)
}

async function verify(inst) {
  if (!inst.clinicId) return
  const res = await fetch(`${EVO}/webhook/find/${inst.name}`, { headers: { apikey: ADMIN_KEY } })
  const j = await res.json().catch(() => ({}))
  const hasKey = j?.headers && (j.headers.apikey || j.headers.Apikey)
  console.log(`  · ${inst.label}: enabled=${j?.enabled} headers.apikey=${hasKey ? 'PRESENTE ✓' : 'AUSENTE ✗'} events=${(j?.events||[]).join(',')}`)
}

console.log('═══ Aplicando webhook headers ═══')
for (const inst of INSTANCES) await setWebhook(inst)
console.log('\n═══ Verificação ═══')
for (const inst of INSTANCES) await verify(inst)
