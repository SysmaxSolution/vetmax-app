'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, CheckCircle2, Copy, QrCode, RefreshCcw } from 'lucide-react'
import { createPixCharge, checkPixCharge } from '@/lib/actions/pix'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Props {
  amount:      number
  description?: string
  onPaid:      (r: { txid: string; e2eid: string | null; amount: number }) => void
  onCancel:    () => void
}

export default function PixDynamicModal({ amount, description, onPaid, onCancel }: Props) {
  const [phase, setPhase]   = useState<'creating' | 'waiting' | 'paid' | 'error'>('creating')
  const [error, setError]   = useState<string | null>(null)
  const [txid, setTxid]     = useState<string | null>(null)
  const [brcode, setBrcode] = useState<string>('')
  const [qr, setQr]         = useState<string>('')
  const [env, setEnv]       = useState<'sandbox' | 'production'>('sandbox')
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // cria a cobrança + gera o QR
  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await createPixCharge({ amount, description })
      if (!alive) return
      if ('error' in res) { setError(res.error); setPhase('error'); return }
      setTxid(res.txid); setBrcode(res.brcode); setEnv(res.environment)
      try {
        const QRCode = (await import('qrcode')).default
        setQr(await QRCode.toDataURL(res.brcode || res.txid, { width: 240, margin: 1 }))
      } catch { /* sem QR: mostra só o copia e cola */ }
      setPhase('waiting')
    })()
    return () => { alive = false }
  }, [amount, description])

  // polling do status
  useEffect(() => {
    if (phase !== 'waiting' || !txid) return
    pollRef.current = setInterval(async () => {
      const st = await checkPixCharge(txid)
      if ('error' in st) return
      if (st.paid) { finishPaid(st.e2eid) }
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [phase, txid])

  function finishPaid(e2eid: string | null) {
    if (pollRef.current) clearInterval(pollRef.current)
    setPhase('paid')
    setTimeout(() => onPaid({ txid: txid ?? '', e2eid, amount }), 900)
  }

  async function copy() {
    try { await navigator.clipboard.writeText(brcode); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* noop */ }
  }

  const body = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 p-4" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-emerald-50/50">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">PIX dinâmico · {fmt(amount)}</h2>
          </div>
          <button onClick={onCancel} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-5 py-5 flex flex-col items-center text-center gap-3">
          {phase === 'creating' && <div className="py-10 flex items-center gap-2 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Gerando cobrança…</div>}

          {phase === 'error' && <div className="py-8 text-sm text-rose-700">{error}</div>}

          {phase === 'waiting' && (
            <>
              {qr
                ? <img src={qr} alt="QR Code PIX" className="h-56 w-56 rounded-xl border border-slate-200" />
                : <div className="h-56 w-56 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400 p-4">Use o copia e cola abaixo</div>}
              <p className="text-sm text-slate-600">Peça para o cliente ler o QR Code no app do banco.</p>
              <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <Copy className="h-3.5 w-3.5" /> {copied ? 'Copiado!' : 'Copiar código (copia e cola)'}
              </button>
              <div className="flex items-center gap-2 text-xs text-emerald-600 mt-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando pagamento…
              </div>
              {env === 'sandbox' && (
                <button onClick={() => finishPaid('SANDBOX-E2E')} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-200">
                  <RefreshCcw className="h-3.5 w-3.5" /> Simular pagamento (sandbox)
                </button>
              )}
            </>
          )}

          {phase === 'paid' && (
            <div className="py-10 flex flex-col items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-14 w-14" />
              <p className="text-base font-bold">Pagamento confirmado!</p>
              <p className="text-xs text-slate-500">Registrando no caixa…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(body, document.body) : null
}
