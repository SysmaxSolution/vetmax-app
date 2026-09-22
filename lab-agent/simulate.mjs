#!/usr/bin/env node
// Simulador de analisador — conecta no agente e envia um ORU (resultado) e um
// QRY (worklist), imprimindo as respostas. Valida a ponta MLLP/HL7 sem aparelho.
//   node simulate.mjs [--port 9100] [--barcode 204457]

import net from 'node:net'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => {
  if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return acc
}, []))
const port = Number(args.port || 9100)
const barcode = String(args.barcode || '204457')

const VT = '\x0b', FS = '\x1c', CR = '\x0d'
const frame = (m) => VT + m + FS + CR
const unframe = (b) => b.replace(/\x0b/g, '').replace(/\x1c\x0d/g, '')

const ORU = [
  `MSH|^~\\&|URIT|LAB|SYSVETMAX|CLINICA|20260908||ORU^R01|1001|P|2.3.1`,
  `PID|1||${barcode}||Rex`,
  `OBR|1|||HEM^Hemograma^L`,
  `OBX|1|NM|718-7^Hemoglobina^LN||13.5|g/dL|12.0-16.0|N|||F`,
  `OBX|2|NM|4544-3^Hematocrito^LN||58|%|37-55|H|||F`,
].join('\r')

const QRY = [
  `MSH|^~\\&|URIT|LAB|SYSVETMAX|CLINICA|20260908||QRY^Q02|2002|P|2.3.1`,
  `QRD|20260908|R|D|Q1|||1^RD|${barcode}|OTH`,
  `QRF|LAB`,
].join('\r')

const sock = net.connect(port, '127.0.0.1', () => {
  console.log(`→ conectado ao agente em 127.0.0.1:${port}`)
  console.log('→ enviando ORU (resultado)…'); sock.write(frame(ORU))
  setTimeout(() => { console.log('→ enviando QRY (worklist) para amostra', barcode, '…'); sock.write(frame(QRY)) }, 600)
  setTimeout(() => { sock.end() }, 1600)
})
sock.setEncoding('binary')
sock.on('data', d => { for (const m of d.split(FS + CR).filter(Boolean)) { const t = unframe(m).trim(); if (t) console.log('← resposta:\n' + t.replace(/\r/g, '\n')) } })
sock.on('close', () => { console.log('✓ simulação encerrada'); process.exit(0) })
sock.on('error', e => { console.error('erro:', e.message); process.exit(1) })
