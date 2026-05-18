'use client'

/**
 * LaudoPrintable — wrapper que coloca o CanvaA4Preview em modo print e
 * dispara window.print() (e opcionalmente html2canvas+jspdf para download).
 *
 * Renderizado em /dashboard/consultation/[id]/print/[docId]. O usuário cai
 * direto na visualização do laudo; pressionar Ctrl+P aciona o motor nativo
 * do navegador, que respeita o @page A4 do canva-print.css.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import type { CanvaContentJson, CanvaTemplateConfig } from '@/lib/canva/types'
import CanvaA4Preview from './CanvaA4Preview'

interface PatientHeader {
  patient_name?: string
  tutor_name?: string
  species?: string
  breed?: string
  age?: string
  sex?: string
  weight?: string
  date?: string
  vet_name?: string
  crmv?: string
}

interface Props {
  documentTitle: string
  config: CanvaTemplateConfig
  content: CanvaContentJson
  patient: PatientHeader
  /** Quando true, dispara print automaticamente após montar. */
  autoPrint?: boolean
}

export default function LaudoPrintable({
  documentTitle, config, content, patient, autoPrint,
}: Props) {
  const printAreaRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  const doPrint = useCallback(() => {
    if (typeof window === 'undefined') return
    window.print()
  }, [])

  const doDownloadPdf = useCallback(async () => {
    if (typeof window === 'undefined' || !printAreaRef.current) return
    setBusy(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const pages = printAreaRef.current.querySelectorAll<HTMLElement>('.canva-a4-page')
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const W = 210, H = 297

      for (let i = 0; i < pages.length; i++) {
        const node = pages[i]
        const canvas = await html2canvas(node, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        })
        const img = canvas.toDataURL('image/png')
        if (i > 0) pdf.addPage('a4', 'portrait')
        pdf.addImage(img, 'PNG', 0, 0, W, H, undefined, 'FAST')
      }

      const safe = documentTitle.replace(/[^\w.-]+/g, '_')
      pdf.save(`${safe || 'laudo'}.pdf`)
    } finally {
      setBusy(false)
    }
  }, [documentTitle])

  useEffect(() => {
    if (autoPrint) {
      const id = window.setTimeout(doPrint, 350)
      return () => window.clearTimeout(id)
    }
  }, [autoPrint, doPrint])

  return (
    <div className="canva-print-shell min-h-screen bg-slate-100 p-6">
      <div className="canva-print-controls mx-auto mb-4 flex max-w-[820px] items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
        <h1 className="text-sm font-semibold text-slate-800">{documentTitle}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={doDownloadPdf}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Baixar PDF
          </button>
          <button
            type="button"
            onClick={doPrint}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir (Ctrl+P)
          </button>
        </div>
      </div>

      <div
        ref={printAreaRef}
        className="canva-print-area mx-auto max-w-[820px]"
      >
        <CanvaA4Preview
          backgroundUrl={config.background_image_url}
          margins={config.margins}
          blockStyle={config.block_style}
          patient={patient}
          content={content}
          documentTitle={documentTitle}
          mode="print"
          pages={1}
        />
      </div>
    </div>
  )
}
