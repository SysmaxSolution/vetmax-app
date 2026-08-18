'use client'

import { useState } from 'react'
import { FileDown, FileText } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import type { CashierReportSummary } from '@/lib/actions/cashier-reports'

const MODULE_LABELS: Record<string, string> = {
  grooming: 'Banho e Tosa', pharmacy: 'Farmácia', consultation: 'Consulta',
  exam: 'Exame', manual: 'Manual', adjustment: 'Ajuste',
  'outflow:sangria': 'Sangria', 'outflow:despesa_operacional': 'Despesa Op.',
  'outflow:fornecedor': 'Fornecedor', 'outflow:estorno': 'Estorno',
  'outflow:other': 'Outro',
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX', credit: 'Crédito', debit: 'Débito',
  cash: 'Dinheiro', convenio: 'Convênio', other: 'Outro', nao_informado: '—',
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface Props {
  data:        CashierReportSummary
  periodLabel: string
  clinicName:  string
}

export default function ReportExport({ data, periodLabel, clinicName }: Props) {
  const [loadingPdf, setLoadingPdf] = useState(false)

  function handleCsv() {
    const headers = [
      'Tipo','Data/Hora','Módulo','Pet','Tutor','Fornecedor',
      'Forma Pgto','Status','Descrição','Valor',
    ]
    const lines = [headers.join(';')]
    for (const r of data.rows) {
      lines.push([
        r.entry_type === 'inflow' ? 'Entrada' : 'Saida',
        fmtDate(r.occurred_at),
        MODULE_LABELS[r.source_module] ?? r.source_module,
        r.patient_name ?? '',
        r.tutor_name ?? '',
        r.supplier_name ?? '',
        r.payment_method ? (PAYMENT_LABELS[r.payment_method] ?? r.payment_method) : '',
        r.status,
        r.description ?? '',
        Number(r.amount).toFixed(2).replace('.', ','),
      ].map(csvEscape).join(';'))
    }
    // Linhas de totalizadores
    lines.push('')
    lines.push(`Total Entradas;;;;;;;;;${data.totals.inflows.toFixed(2).replace('.', ',')}`)
    lines.push(`Total Saidas;;;;;;;;;${data.totals.outflows.toFixed(2).replace('.', ',')}`)
    lines.push(`Saldo;;;;;;;;;${data.totals.balance.toFixed(2).replace('.', ',')}`)

    const bom = '﻿'
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `caixa-relatorio-${periodLabel.replace(/\//g, '-')}.csv`)
  }

  async function handlePdf() {
    setLoadingPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      // A4 landscape: 297mm × 210mm
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const W = 297, H = 210
      const margin = 12
      const colX   = [margin, margin+18, margin+48, margin+72, margin+108, margin+138, margin+158, margin+174]
      const colW   = [18, 30, 24, 36, 30, 20, 16, 30]
      const rowH   = 6
      let y        = margin

      function addPage() {
        doc.addPage()
        y = margin
        drawTableHeader()
      }

      // ── Header ──────────────────────────────────────────────────────────────
      doc.setFontSize(14)
      doc.setTextColor(15, 118, 110)
      doc.text(`${clinicName} — Relatório de Caixa`, margin, y + 5)
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      doc.text(`Período: ${periodLabel}  ·  ${data.totals.count} lançamentos  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, y + 10)
      doc.setDrawColor(15, 118, 110)
      doc.line(margin, y + 12, W - margin, y + 12)
      y += 16

      // ── KPIs ────────────────────────────────────────────────────────────────
      const kpis = [
        { label: 'Entradas', value: fmt(data.totals.inflows), color: [5, 150, 105] as [number,number,number] },
        { label: 'Saídas',   value: fmt(data.totals.outflows), color: [220, 38, 38] as [number,number,number] },
        { label: 'Saldo',    value: fmt(data.totals.balance), color: data.totals.balance >= 0 ? [5, 150, 105] as [number,number,number] : [220, 38, 38] as [number,number,number] },
      ]
      const kpiW = 40, kpiH = 12, kpiGap = 6
      kpis.forEach((k, i) => {
        const kx = margin + i * (kpiW + kpiGap)
        doc.setDrawColor(226, 232, 240)
        doc.setFillColor(248, 250, 252)
        doc.roundedRect(kx, y, kpiW, kpiH, 2, 2, 'FD')
        doc.setFontSize(7)
        doc.setTextColor(100, 116, 139)
        doc.text(k.label, kx + 3, y + 4)
        doc.setFontSize(10)
        doc.setTextColor(...k.color)
        doc.text(k.value, kx + 3, y + 10)
      })
      y += kpiH + 6

      // ── Table ───────────────────────────────────────────────────────────────
      const headers = ['Tipo','Data/Hora','Módulo','Pet/Forn.','Tutor','Forma','Status','Valor']

      function drawTableHeader() {
        doc.setFillColor(240, 253, 250)
        doc.rect(margin, y, W - margin * 2, rowH, 'F')
        doc.setFontSize(7)
        doc.setTextColor(15, 118, 110)
        headers.forEach((h, i) => doc.text(h, colX[i] + 1, y + 4))
        doc.setDrawColor(15, 118, 110)
        doc.line(margin, y + rowH, W - margin, y + rowH)
        y += rowH
      }

      drawTableHeader()

      const rows = data.rows.slice(0, 1500)
      rows.forEach((r) => {
        if (y + rowH > H - 14) addPage()
        const isIn = r.entry_type === 'inflow'
        doc.setFontSize(6.5)
        doc.setTextColor(51, 65, 85)
        doc.text(isIn ? 'Entrada' : 'Saída', colX[0] + 1, y + 4)
        doc.text(fmtDate(r.occurred_at).slice(0, 14), colX[1] + 1, y + 4)
        doc.text((MODULE_LABELS[r.source_module] ?? r.source_module).slice(0, 12), colX[2] + 1, y + 4)
        const pet = (r.patient_name || r.supplier_name || r.description || '—').slice(0, 18)
        doc.text(pet, colX[3] + 1, y + 4)
        doc.text((r.tutor_name || '—').slice(0, 14), colX[4] + 1, y + 4)
        doc.text(r.payment_method ? (PAYMENT_LABELS[r.payment_method] ?? r.payment_method).slice(0, 8) : '—', colX[5] + 1, y + 4)
        doc.text((r.status ?? '').slice(0, 8), colX[6] + 1, y + 4)
        doc.setTextColor(...(isIn ? [5, 150, 105] as [number,number,number] : [220, 38, 38] as [number,number,number]))
        doc.text(`${isIn ? '+' : '-'} ${fmt(Math.abs(Number(r.amount)))}`, colX[7] + 1, y + 4)
        doc.setDrawColor(226, 232, 240)
        doc.line(margin, y + rowH, W - margin, y + rowH)
        y += rowH
      })

      if (data.rows.length > 1500) {
        y += 4
        doc.setFontSize(7)
        doc.setTextColor(220, 38, 38)
        doc.text(`PDF limitado a 1500 lançamentos. Use CSV para todos os ${data.rows.length} registros.`, margin, y)
      }

      // ── Footer (all pages) ────────────────────────────────────────────────
      const total = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
      for (let p = 1; p <= total; p++) {
        doc.setPage(p)
        doc.setFontSize(7)
        doc.setTextColor(148, 163, 184)
        doc.text(`${clinicName} · Página ${p} de ${total}`, W / 2, H - 5, { align: 'center' })
      }

      doc.save(`caixa-relatorio-${periodLabel.replace(/\//g, '-')}.pdf`)
    } finally {
      setLoadingPdf(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCsv}
        disabled={data.rows.length === 0}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
      >
        <FileDown className="h-3.5 w-3.5" />
        Exportar CSV
      </button>
      <button
        type="button"
        onClick={handlePdf}
        disabled={data.rows.length === 0 || loadingPdf}
        className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60 transition-colors"
      >
        {loadingPdf ? <Spinner size="sm" /> : <FileText className="h-3.5 w-3.5" />}
        Exportar PDF
      </button>
    </div>
  )
}
