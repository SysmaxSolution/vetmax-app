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
import zlib from 'node:zlib'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
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
// Versão desta cópia do agente. É o que o servidor compara para decidir se há
// atualização. Mexeu no arquivo? Suba a versão — é ela que viaja no heartbeat.
const VERSION = '2026.10.01'

const agentFile  = path.join(process.cwd(), 'agent.mjs')
const prevFile   = path.join(process.cwd(), 'agent.prev.mjs')
const stageFile  = path.join(process.cwd(), 'agent.next.mjs')
const updState   = path.join(process.cwd(), 'update-state.json')

const cfgPath = path.join(process.cwd(), 'config.json')
if (fs.existsSync(cfgPath)) { try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch {} }
let environment = args.env || cfg.environment || 'dev'
let token = args.token || cfg.token || process.env.SYSVETMAX_LAB_TOKEN
let baseUrl = args.url || cfg.url || ENV_URLS[environment] || ENV_URLS.dev
const port = Number(args.port || cfg.port || 9100)
const dryRun = Boolean(args.dry || cfg.dry)
// Compressão do corpo enviado à nuvem. Liga por padrão; `--no-gzip` (ou
// "gzip": false no config.json) desliga. Se o servidor recusar o corpo
// comprimido, o agente volta sozinho para JSON puro — ver api().
let gzipEnabled = !(args['no-gzip'] === true || cfg.gzip === false)
const GZIP_MIN_BYTES = 4096   // abaixo disso comprimir não paga o CPU

if (!token) { console.error('ERRO: informe --token (código de pareamento).'); process.exit(1) }

// Persiste o ambiente/token atuais em config.json (usado no próximo boot).
function persistConfig() {
  try { fs.writeFileSync(cfgPath, JSON.stringify({ environment, url: baseUrl, token, port, dry: dryRun, gzip: gzipEnabled }, null, 2)) } catch (e) { log('! não consegui gravar config.json:', e.message) }
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
const deadFile  = path.join(process.cwd(), 'rejected-results.jsonl')

// ─── Fila de reenvio ────────────────────────────────────────────────────────
// Um ORU com histogramas tem ~47 kB (~12 kB comprimido). A versão anterior
// reenviava a fila INTEIRA a cada 30 s, para sempre: um resultado que nunca
// casa (tubo não cadastrado, amostra de teste do próprio aparelho) custava
// ~135 MB/dia de tráfego eternamente — foi o que saturou a cota da nuvem.
// Agora cada item tem espera progressiva, uma sonda barata antes do corpo
// pesado, prazo de validade e teto de fila.
const QUEUE_MAX    = 500
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000              // 24 h e o item sai da fila
const BACKOFF_MS   = [30e3, 60e3, 120e3, 300e3, 900e3, 1800e3, 3600e3]
// Só o que NUNCA vai passar: corpo malformado/grande demais. 404 fica de fora
// de propósito — o tubo pode ser cadastrado depois que o aparelho já rodou.
const PERMANENT    = new Set([400, 413, 422])

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
const backoffFor = (tries) => BACKOFF_MS[Math.min(tries, BACKOFF_MS.length - 1)]

/** Lê a fila tolerando o formato antigo (payload cru por linha) e deduplicando. */
function readQueue() {
  if (!fs.existsSync(queueFile)) return []
  const out = [], seen = new Set()
  for (const line of fs.readFileSync(queueFile, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let o; try { o = JSON.parse(line) } catch { continue }
    const item = (o && o.v === 2) ? o : { v: 2, payload: o, first: Date.now(), tries: 0, next: 0 }
    const hl7 = String(item.payload?.hl7 ?? '')
    if (!hl7) continue
    // A fila gravada pela versão anterior guardou `barcode` VAZIO (ela só lia
    // PID-3, que nos dois aparelhos vem em branco). Sem número de amostra a
    // sonda barata não tem o que perguntar e o item voltaria a custar o corpo
    // inteiro — então recupera do próprio HL7 ao carregar.
    if (!String(item.payload?.barcode ?? '').trim()) {
      const b = pidBarcode(hl7)
      if (b) item.payload = { ...item.payload, barcode: b }
    }
    const key = sha1(hl7)
    if (seen.has(key)) continue   // mesma mensagem duplicada (retransmissão do aparelho ou cópia de pasta)
    seen.add(key); item.key = key
    out.push(item)
  }
  return out.slice(-QUEUE_MAX)
}

const writeQueue = (items) => fs.writeFileSync(
  queueFile,
  items.map(i => JSON.stringify({ v: 2, payload: i.payload, first: i.first, tries: i.tries, next: i.next })).join('\n')
    + (items.length ? '\n' : ''))

function toDeadLetter(item, motivo) {
  try {
    fs.appendFileSync(deadFile, JSON.stringify({
      at: new Date().toISOString(), motivo, barcode: item.payload?.barcode ?? '', payload: item.payload,
    }) + '\n')
  } catch {}
  log('   ⨯ fora da fila (', motivo, ') — guardado em rejected-results.jsonl')
}

function enqueue(payload, motivo) {
  const items = readQueue()
  const key = sha1(String(payload.hl7 ?? ''))
  if (items.some(i => i.key === key)) { log('   = já estava na fila — não duplicado'); return }
  items.push({ v: 2, payload, first: Date.now(), tries: 0, next: Date.now() + BACKOFF_MS[0], key })
  const kept = items.slice(-QUEUE_MAX)
  writeQueue(kept)
  log('   ↻ enfileirado (', motivo, ') — fila:', kept.length)
}

/** Sonda de ~60 bytes: evita reenviar 47 kB contra uma amostra que não existe. */
async function sampleKnown(barcode) {
  if (!barcode) return null
  try { await api('/api/lab/worklist', 'POST', { barcode }); return true }
  catch (e) { return e.status === 404 ? false : null }
}

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
// Nº da amostra, na mesma ordem de confiança que a rota /api/lab/results usa:
// PID-3 e, quando ele vem vazio, OBR-3 — é ONDE o URIT BH-5100 e o BK-200
// realmente põem o número do tubo (nos dois o PID chega como `PID|1||||||0|`).
// Sem o OBR-3 o agente mandava barcode vazio e a sonda barata da fila não
// tinha o que perguntar, voltando a gastar o corpo inteiro a cada tentativa.
function pidBarcode(msg) {
  const pid = (seg(msg, 'PID')?.split('|')[3] ?? '').split('^')[0].trim()
  if (pid) return pid
  return (seg(msg, 'OBR')?.split('|')[3] ?? '').split('^')[0].trim()
}
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
// Um ORU de hemograma do URIT tem ~47 kB (quase tudo base64 dos histogramas);
// gzip leva o mesmo corpo em ~12 kB. A rota /api/lab/results aceita os dois
// formatos, então um agente antigo (sem esta versão) continua funcionando.
async function send(pathName, method, body, useGzip) {
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
  let payload
  if (body !== undefined && body !== null) {
    payload = Buffer.from(JSON.stringify(body), 'utf8')
    if (useGzip) {
      payload = zlib.gzipSync(payload, { level: 6 })
      headers['Content-Encoding'] = 'gzip'
    }
  }
  const res = await fetch(baseUrl + pathName, { method, headers, body: payload })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

async function api(pathName, method, body) {
  const raw = body ? Buffer.byteLength(JSON.stringify(body), 'utf8') : 0
  const useGzip = gzipEnabled && raw >= GZIP_MIN_BYTES
  let r = await send(pathName, method, body, useGzip)

  // Agente novo contra servidor antigo (ou proxy que engole o cabeçalho):
  // desliga a compressão para o resto da sessão e reenvia em JSON puro.
  if (!r.ok && useGzip && (r.status === 400 || r.status === 415)) {
    log('! servidor recusou corpo comprimido — reenviando sem gzip (desligado nesta sessao)')
    gzipEnabled = false
    r = await send(pathName, method, body, false)
  }
  if (!r.ok) { const err = new Error(r.json.error || ('HTTP ' + r.status)); err.status = r.status; throw err }
  return r.json
}

async function flushQueue() {
  const items = readQueue()
  if (!items.length) return
  const now = Date.now(), keep = []
  for (const it of items) {
    if (now - it.first > QUEUE_TTL_MS) { toDeadLetter(it, 'sem destino por 24 h'); continue }
    if (it.next > now) { keep.push(it); continue }          // ainda no intervalo de espera

    // Pergunta primeiro, com um corpo mínimo, se o tubo já existe no sistema.
    const known = await sampleKnown(it.payload?.barcode)
    if (known === false) { it.tries += 1; it.next = now + backoffFor(it.tries); keep.push(it); continue }

    try {
      const r = await api('/api/lab/results', 'POST', it.payload)
      log('↑ resultado reenviado da fila (', it.payload?.barcode, ') ·', r.count, 'analitos')
    } catch (e) {
      if (PERMANENT.has(e.status)) { toDeadLetter(it, e.message); continue }
      it.tries += 1; it.next = now + backoffFor(it.tries)
      keep.push(it)
    }
  }
  writeQueue(keep)
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
      if (dryRun) {
        const plain = Buffer.byteLength(JSON.stringify(payload), 'utf8')
        const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 6 }).length
        log('   [dry-run] POST /api/lab/results', plain, 'bytes cru ·', gz, 'bytes com gzip')
      }
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

// ─── Auto-atualização ───────────────────────────────────────────────────────
// Ninguém precisa entrar por AnyDesk para atualizar o agente. O heartbeat já
// pergunta se existe versão nova; aqui ela é baixada, conferida e trocada, e o
// processo se reinicia sozinho. Três travas para não atrapalhar a clínica:
//   1. só troca com ZERO conexões de aparelho abertas (nunca no meio de um exame);
//   2. confere o SHA-256 e roda `node --check` ANTES de trocar — arquivo
//      corrompido não chega a virar o agente que roda;
//   3. guarda a versão anterior; se a nova não conseguir se comunicar logo após
//      subir, ela volta sozinha.

let conexoesAbertas = 0
let atualizando = false

const lerEstadoUpdate = () => {
  try { return JSON.parse(fs.readFileSync(updState, 'utf8')) } catch { return {} }
}
const gravarEstadoUpdate = (o) => {
  try { fs.writeFileSync(updState, JSON.stringify(o, null, 2)) } catch {}
}

/** Reinicia o agente: solta a porta, sobe o novo processo e sai. */
function reiniciar(motivo) {
  log('⟳ reiniciando —', motivo)
  const subir = () => {
    try {
      spawn(process.execPath, [agentFile], { cwd: process.cwd(), detached: true, stdio: 'ignore' }).unref()
    } catch (e) { log('! não consegui subir o novo processo:', e.message) }
    process.exit(0)
  }
  // Fecha o servidor primeiro para o processo novo conseguir a porta.
  try { server.close(subir) } catch { subir() }
  setTimeout(subir, 3000).unref?.()
}

async function aplicarAtualizacao(info) {
  if (atualizando || !info?.version || info.version === VERSION) return
  if (conexoesAbertas > 0) { log(`· versão ${info.version} disponível — esperando o aparelho terminar (${conexoesAbertas} conexão(ões))`); return }
  if (!fs.existsSync(agentFile)) { log('! não achei agent.mjs no diretório de trabalho — atualização ignorada'); return }
  atualizando = true
  try {
    log(`↓ baixando versão ${info.version} (atual: ${VERSION})`)
    const r = await api('/api/lab/agent-update?version=' + encodeURIComponent(info.version), 'GET')
    const fonte = String(r?.source ?? '')
    if (!fonte) throw new Error('resposta sem o conteúdo do agente')

    const hash = crypto.createHash('sha256').update(fonte, 'utf8').digest('hex')
    if (info.sha256 && hash !== info.sha256) throw new Error(`hash não confere (esperado ${info.sha256.slice(0, 12)}…, veio ${hash.slice(0, 12)}…)`)

    fs.writeFileSync(stageFile, fonte, 'utf8')
    // Arquivo truncado/corrompido morre aqui, e não virando o agente que roda.
    execFileSync(process.execPath, ['--check', stageFile], { stdio: 'pipe' })

    // Entre conferir e trocar, um aparelho pode ter conectado.
    if (conexoesAbertas > 0) { log('· aparelho conectou durante o download — troca adiada'); fs.unlinkSync(stageFile); atualizando = false; return }

    fs.copyFileSync(agentFile, prevFile)
    fs.renameSync(stageFile, agentFile)
    gravarEstadoUpdate({ pending: true, from: VERSION, to: info.version, at: new Date().toISOString() })
    log(`✓ versão ${info.version} instalada (anterior guardada em agent.prev.mjs)`)
    reiniciar(`atualização ${VERSION} → ${info.version}`)
  } catch (e) {
    log('! atualização falhou:', e.message)
    try { if (fs.existsSync(stageFile)) fs.unlinkSync(stageFile) } catch {}
    try { await api('/api/lab/agent-update', 'POST', { version: info.version, ok: false, error: String(e.message).slice(0, 300) }) } catch {}
    atualizando = false
  }
}

/** Primeiro heartbeat depois de uma troca: confirma ou desfaz. */
async function conferirPosAtualizacao(pingOk) {
  const st = lerEstadoUpdate()
  if (!st.pending) return
  if (st.to !== VERSION) return            // não é esta troca
  if (pingOk) {
    gravarEstadoUpdate({ pending: false, from: st.from, to: st.to, at: st.at, confirmed_at: new Date().toISOString() })
    log(`✓ versão ${VERSION} confirmada (vinha de ${st.from})`)
    try { await api('/api/lab/agent-update', 'POST', { version: VERSION, ok: true }) } catch {}
    return
  }
  const falhas = Number(st.failures ?? 0) + 1
  gravarEstadoUpdate({ ...st, failures: falhas })
  if (falhas < 3) { log(`! versão nova sem comunicação (${falhas}/3)`); return }
  if (!fs.existsSync(prevFile)) { log('! sem cópia anterior para voltar'); return }
  log(`! versão ${VERSION} não se comunicou 3x — voltando para ${st.from}`)
  try {
    fs.copyFileSync(prevFile, agentFile)
    gravarEstadoUpdate({ pending: false, rolled_back_from: VERSION, to: st.from, at: new Date().toISOString() })
    reiniciar(`rollback para ${st.from}`)
  } catch (e) { log('! rollback falhou:', e.message) }
}

// ─── Servidor MLLP (LAN) ─────────────────────────────────────────────────────
const server = net.createServer(sock => {
  const peer = sock.remoteAddress
  conexoesAbertas++
  log('• conexão do aparelho', peer)
  let buf = ''
  sock.setEncoding('binary')
  sock.on('data', async d => {
    buf += d
    const { messages, rest } = extractMLLP(buf); buf = rest
    for (const m of messages) { try { await handleMessage(m, sock) } catch (e) { log('erro:', e.message) } }
  })
  sock.on('error', e => log('socket erro:', e.message))
  sock.on('close', () => { conexoesAbertas = Math.max(0, conexoesAbertas - 1); log('• conexão encerrada', peer) })
})

// Ping periódico: confirma pareamento, informa o ambiente atual e recebe (uma vez)
// eventual reconfiguração remota agendada no painel.
async function heartbeat() {
  try {
    const p = await api(`/api/lab/ping?env=${encodeURIComponent(environment)}&v=${encodeURIComponent(VERSION)}`, 'GET')
    if (p.reconfigure) applyReconfigure(p.reconfigure)
    await conferirPosAtualizacao(true)
    if (p.update) await aplicarAtualizacao(p.update)
    return p
  } catch (e) {
    log('! ping falhou (', e.message, ') — verifique token/ambiente')
    await conferirPosAtualizacao(false)
    return null
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────
;(async () => {
  log(`SYSVETMAX Lab Agent v${VERSION} · ambiente=${environment} · ${baseUrl}`)
  if (!dryRun) {
    const p = await heartbeat()
    if (p) log('✓ pareado com a clínica:', p.clinic_name || p.clinic_id)
  }
  // Numa troca de versão o processo antigo pode levar um instante para soltar a
  // porta. Em vez de morrer com EADDRINUSE, tenta de novo por até 15 s.
  let tentativas = 0
  server.on('error', (e) => {
    if (e.code !== 'EADDRINUSE' || tentativas >= 15) { log('! erro ao escutar:', e.message); process.exit(1) }
    tentativas++
    if (tentativas === 1) log(`· porta ${port} ainda ocupada (processo anterior saindo) — aguardando`)
    setTimeout(() => server.listen(port), 1000)
  })
  server.listen(port, () => log(`escutando MLLP em 0.0.0.0:${port} (aponte o aparelho para o IP deste PC:${port})`))
  setInterval(() => flushQueue().catch(() => {}), 30000)   // reenvia a fila a cada 30s
  if (!dryRun) setInterval(() => heartbeat().catch(() => {}), 60000)   // ping + reconfiguração remota
})()
