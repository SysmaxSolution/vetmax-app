#!/usr/bin/env node
// Agente-ponte de laboratório SYSVETMAX.
// Aparelho (URIT/BK-200) ⟷ [MLLP/HL7 na LAN] ⟷ AGENTE ⟷ [HTTPS] ⟷ nuvem.
// Sem dependências externas (Node >=18). Config na nuvem via token de pareamento.
//
// Uso:
//   node agent.mjs --env dev  --token lab_xxx [--port 9100] [--url https://...]
//   node agent.mjs --env prod --token lab_xxx
//
// O ambiente (dev/prod) só troca a URL base — o token vale no ambiente onde foi gerado.

import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ─── Config ───────────────────────────────────────────────────────────────────
const ENV_URLS = {
  dev:  'https://sysvetmax-dev.vercel.app',
  prod: 'https://app.sysvetmaxsolutions.com',   // ajustar ao domínio real de produção
}
function parseArgs() {
  const a = process.argv.slice(2), o = {}
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = (a[i + 1] && !a[i + 1].startsWith('--')) ? a[++i] : true
  return o
}
const args = parseArgs()
let cfg = {}
const cfgPath = path.join(process.cwd(), 'config.json')
if (fs.existsSync(cfgPath)) { try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch {} }
let environment = args.env || cfg.environment || 'dev'
let token = args.token || cfg.token || process.env.SYSVETMAX_LAB_TOKEN
let baseUrl = args.url || cfg.url || ENV_URLS[environment] || ENV_URLS.dev
const port = Number(args.port || cfg.port || 9100)
const dryRun = Boolean(args.dry || cfg.dry)

if (!token) { console.error('ERRO: informe --token (código de pareamento).'); process.exit(1) }

// Persiste o ambiente/token atuais em config.json (usado no próximo boot).
function persistConfig() {
  try { fs.writeFileSync(cfgPath, JSON.stringify({ environment, url: baseUrl, token, port, dry: dryRun }, null, 2)) } catch (e) { log('! não consegui gravar config.json:', e.message) }
}

// Promoção/repontamento remoto: o painel agenda um destino; aqui aplicamos ao vivo
// (as próximas chamadas já usam a nova URL/token) e persistimos p/ o próximo boot.
function applyReconfigure(rc) {
  if (!rc || !rc.token) return
  const newUrl = rc.url || ENV_URLS[rc.environment] || baseUrl
  if (rc.token === token && newUrl === baseUrl) return   // nada mudou
  environment = rc.environment || environment
  baseUrl = newUrl
  token = rc.token
  persistConfig()
  log(`⟳ reconfigurado remotamente → ambiente=${environment} · ${baseUrl}`)
}

const log = (...m) => console.log(new Date().toISOString(), ...m)
const queueFile = path.join(process.cwd(), 'pending-results.jsonl')

// ─── MLLP / HL7 (cópia standalone das funções puras testadas em src/lib/lab) ────
const VT = '\x0b', FS = '\x1c', CR = '\x0d'
const frameMLLP = (m) => VT + m + FS + CR
function extractMLLP(buffer) {
  const messages = []; let rest = buffer
  const fv = rest.indexOf(VT); if (fv > 0) rest = rest.slice(fv)
  let end
  while ((end = rest.indexOf(FS + CR)) !== -1) {
    const start = rest.indexOf(VT)
    if (start === -1 || start > end) { rest = rest.slice(end + 2); continue }
    messages.push(rest.slice(start + 1, end)); rest = rest.slice(end + 2)
    const nv = rest.indexOf(VT); if (nv > 0) rest = rest.slice(nv)
  }
  return { messages, rest }
}
const seg = (msg, name) => msg.split(/\r\n|\r|\n/).find(s => s.startsWith(name))
const controlId = (msg) => (seg(msg, 'MSH')?.split('|')[9]) || '1'
const msgType = (msg) => (seg(msg, 'MSH')?.split('|')[8]) || ''
function qryBarcode(msg) {
  const q = seg(msg, 'QRD'); if (!q) return null
  const f = q.split('|'); const c = (f[8] ?? '').split('^')[0].trim(); if (c) return c
  for (let i = f.length - 1; i >= 1; i--) { const v = (f[i] ?? '').trim(); if (/\d/.test(v)) return v.split('^')[0] }
  return null
}
function pidBarcode(msg) { const p = seg(msg, 'PID'); return p ? (p.split('|')[3] ?? '').split('^')[0].trim() : '' }
const mshResp = (t, id) => `MSH|^~\\&|SYSVETMAX|LIS|ANALYZER|LAB|${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}||${t}|${id}|P|2.3.1`
const buildAck = (id, code = 'AA') => [mshResp('ACK', id), `MSA|${code}|${id}`].join('\r')
function buildDsr(id, sample) {
  const lines = [mshResp('DSR^Q03', id), `MSA|AA|${id}`, `QAK|${id}|OK`]
  const label = sample.patient_name ?? ''
  ;(sample.exams || []).forEach((ex, i) => lines.push(`DSP|${i + 1}||${sample.barcode}^${ex.code ?? ex.name}^${ex.name}^${label}`))
  if (!(sample.exams || []).length) lines.push(`DSP|1||${sample.barcode}^^SEM_EXAMES^${label}`)
  return lines.join('\r')
}

// ─── Nuvem ──────────────────────────────────────────────────────────────────
async function api(pathName, method, body) {
  const res = await fetch(baseUrl + pathName, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status))
  return json
}

async function flushQueue() {
  if (!fs.existsSync(queueFile)) return
  const lines = fs.readFileSync(queueFile, 'utf8').split('\n').filter(Boolean)
  if (!lines.length) return
  const remaining = []
  for (const line of lines) {
    try { const item = JSON.parse(line); await api('/api/lab/results', 'POST', item); log('↑ resultado reenviado da fila (', item.barcode, ')') }
    catch { remaining.push(line) }
  }
  fs.writeFileSync(queueFile, remaining.join('\n') + (remaining.length ? '\n' : ''))
}

// ─── Manipulação de mensagem do aparelho ────────────────────────────────────
async function handleMessage(msg, sock) {
  const type = msgType(msg), id = controlId(msg)
  const device = seg(msg, 'MSH')?.split('|')[2] || 'aparelho'
  if (type.startsWith('ORU')) {
    const barcode = pidBarcode(msg)
    log('↓ ORU de', device, '· amostra', barcode || '(sem PID)')
    const payload = { hl7: msg, barcode }
    try {
      if (dryRun) log('   [dry-run] POST /api/lab/results', JSON.stringify(payload).length, 'bytes')
      else { const r = await api('/api/lab/results', 'POST', payload); log('   ✓ gravado:', r.count, 'analitos na consulta', r.consultation_id) }
      sock.write(frameMLLP(buildAck(id, 'AA')))
    } catch (e) {
      log('   ! falha ao enviar resultado — enfileirando:', e.message)
      fs.appendFileSync(queueFile, JSON.stringify(payload) + '\n')
      sock.write(frameMLLP(buildAck(id, 'AA')))   // aceita p/ o aparelho não retransmitir; fila garante
    }
  } else if (type.startsWith('QRY')) {
    const barcode = qryBarcode(msg)
    log('↓ QRY (worklist) de', device, '· amostra', barcode)
    try {
      const r = dryRun ? { found: true, barcode, patient_name: 'DRY', exams: [{ name: 'Exame demo' }] } : await api('/api/lab/worklist', 'POST', { barcode })
      const dsr = buildDsr(id, { barcode: r.barcode || barcode, patient_name: r.patient_name, exams: r.exams || [] })
      sock.write(frameMLLP(dsr))
      log('   ↑ DSR enviado com', (r.exams || []).length, 'exame(s)')
    } catch (e) {
      log('   ! worklist falhou:', e.message)
      sock.write(frameMLLP(buildDsr(id, { barcode, exams: [] })))
    }
  } else {
    log('↓ mensagem', type, '— respondendo ACK')
    sock.write(frameMLLP(buildAck(id, 'AA')))
  }
}

// ─── Servidor MLLP (LAN) ─────────────────────────────────────────────────────
const server = net.createServer(sock => {
  const peer = sock.remoteAddress
  log('• conexão do aparelho', peer)
  let buf = ''
  sock.setEncoding('binary')
  sock.on('data', async d => {
    buf += d
    const { messages, rest } = extractMLLP(buf); buf = rest
    for (const m of messages) { try { await handleMessage(m, sock) } catch (e) { log('erro:', e.message) } }
  })
  sock.on('error', e => log('socket erro:', e.message))
  sock.on('close', () => log('• conexão encerrada', peer))
})

// Ping periódico: confirma pareamento, informa o ambiente atual e recebe (uma vez)
// eventual reconfiguração remota agendada no painel.
async function heartbeat() {
  try {
    const p = await api('/api/lab/ping?env=' + encodeURIComponent(environment), 'GET')
    if (p.reconfigure) applyReconfigure(p.reconfigure)
    return p
  } catch (e) { log('! ping falhou (', e.message, ') — verifique token/ambiente'); return null }
}

// ─── Boot ────────────────────────────────────────────────────────────────────
;(async () => {
  log(`SYSVETMAX Lab Agent · ambiente=${environment} · ${baseUrl}`)
  if (!dryRun) {
    const p = await heartbeat()
    if (p) log('✓ pareado com a clínica:', p.clinic_name || p.clinic_id)
  }
  server.listen(port, () => log(`escutando MLLP em 0.0.0.0:${port} (aponte o aparelho para o IP deste PC:${port})`))
  setInterval(() => flushQueue().catch(() => {}), 30000)   // reenvia a fila a cada 30s
  if (!dryRun) setInterval(() => heartbeat().catch(() => {}), 30000)   // ping + reconfiguração remota
})()
