'use client'

/**
 * Drawer de detalhe do documento de Faturamento (O.S. / NFS-e) — Fase 1.
 * Mostra o conteúdo completo + ações: baixar PDF, enviar por WhatsApp,
 * marcar como enviado, cancelar.
 */

import { useState, useEffect } from 'react'
import {
  X, Loader2, Download, Send, MessageCircle, Ban, FileText, CheckCircle2,
} from 'lucide-react'
import {
  getBillingDocument, generateBillingDocumentPdf, markQuotationSent,
  cancelBillingDocument, sendBillingDocumentWhatsApp,
  type BillingDocumentDetail as DocDetail,
} from '@/lib/actions/billing-documents'

interface Props {
  documentId: string
  onClose:    () => void
  onChanged:  () => void
  onToast:    (msg: string, type?: 'success' | 'error') => void
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—' }

export default function BillingDocumentDetail({ documentId, onClose, onChanged, onToast }: Props) {
  const [doc, setDoc] = useState<DocDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getBillingDocument(documentId).then(res => {
      if (cancelled) return
      if (!('error' in res)) setDoc(res)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [documentId])

  async function handlePdf() {
    setBusy('pdf')
    const res = await generateBillingDocumentPdf(documentId)
    setBusy(null)
    if ('error' in res) { onToast(res.error, 'error'); return }
    window.open(res.signed_url, '_blank')
  }

  async function handleWhatsApp() {
    setBusy('wa')
    const res = await sendBillingDocumentWhatsApp(documentId)
    setBusy(null)
    if ('error' in res) { onToast(res.error, 'error'); return }
    onToast('Documento enviado por WhatsApp!')
    // marcar como enviado refletindo no estado
    const refreshed = await getBillingDocument(documentId)
    if (!('error' in refreshed)) setDoc(refreshed)
    onChanged()
  }

  async function handleMarkSent() {
    setBusy('sent')
    const res = await markQuotationSent(documentId)
    setBusy(null)
    if ('error' in res) { onToast(res.error, 'error'); return }
    setDoc(d => d ? { ...d, status: 'sent' } : d)
    onToast('Marcado como enviado.')
    onChanged()
  }

  async function handleCancel() {
    if (!confirm('Cancelar este documento?')) return
    setBusy('cancel')
    const res = await cancelBillingDocument(documentId)
    setBusy(null)
    if ('error' in res) { onToast(res.error, 'error'); return }
    onToast('Documento cancelado.')
    onChanged()
    onClose()
  }

  const isQuote = doc?.doc_type === 'orcamento'
  const canEditState = doc && doc.status !== 'billed' && doc.status !== 'cancelled'

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100"><FileText className="h-5 w-5 text-teal-600" /></div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{loading ? 'Carregando…' : doc?.doc_number}</h2>
              <p className="text-[11px] text-slate-500">{isQuote ? 'Orçamento de Serviços' : 'Nota Fiscal de Serviço'}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        {loading || !doc ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Tutor" value={doc.tutor_name} />
                <Info label="Pet" value={doc.patient_name} />
                <Info label="Profissional" value={doc.professional_name} />
                <Info label="Emissão" value={fmtDate(doc.issue_date)} />
                <Info label="Faturamento" value={fmtDate(doc.billed_date)} />
                <Info label="Válido até" value={fmtDate(doc.valid_until)} />
                {doc.related_doc_number && <Info label="Doc. anterior" value={doc.related_doc_number} />}
                <Info label="Faturado?" value={doc.is_billed ? 'Sim' : 'Não'} />
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Serviços / Itens</div>
                <div className="divide-y divide-slate-100">
                  {doc.items.map((it, i) => (
                    <div key={it.id ?? i} className="flex items-center justify-between px-4 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-700 truncate">{it.description}</p>
                        <p className="text-xs text-slate-400 font-mono tabular-nums">{Number(it.quantity).toLocaleString('pt-BR')} × {fmt(it.unit_price)}</p>
                      </div>
                      <span className="font-semibold text-slate-900 font-mono tabular-nums ml-3">{fmt(it.total_price)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-900">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Total</span>
                    <span className="text-lg font-bold text-white font-mono tabular-nums">{fmt(doc.total_amount)}</span>
                  </div>
                </div>
              </div>

              {Boolean(doc.payload?.payment_methods || doc.payload?.discount_note || doc.payload?.observations) && (
                <div className="rounded-xl border border-slate-200 p-4 space-y-1 text-sm">
                  {doc.payload.payment_methods ? <p><span className="font-semibold text-slate-600">Pagamento:</span> {String(doc.payload.payment_methods)}</p> : null}
                  {doc.payload.discount_note   ? <p><span className="font-semibold text-slate-600">Descontos:</span> {String(doc.payload.discount_note)}</p> : null}
                  {doc.payload.observations    ? <p><span className="font-semibold text-slate-600">Observações:</span> {String(doc.payload.observations)}</p> : null}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={handlePdf} disabled={!!busy} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
                {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
              </button>
              {doc.tutor_id && (
                <button onClick={handleWhatsApp} disabled={!!busy} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy === 'wa' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} WhatsApp
                </button>
              )}
              {isQuote && canEditState && doc.status === 'draft' && (
                <button onClick={handleMarkSent} disabled={!!busy} className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                  {busy === 'sent' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Marcar enviado
                </button>
              )}
              {canEditState && (
                <button onClick={handleCancel} disabled={!!busy} className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 ml-auto">
                  {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Cancelar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-800 truncate">{value || '—'}</p>
    </div>
  )
}
