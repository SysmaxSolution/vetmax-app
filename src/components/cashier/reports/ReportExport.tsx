'use client'

import { useState } from 'react'
import { FileDown, FileText, Loader2 } from 'lucide-react'
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
      'Tipo','Data/Hora','Modulo','Pet','Tutor','Fornecedor',
      'Forma Pgto','Status','Descricao','Valor',
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
      const { pdf, Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer')

      const styles = StyleSheet.create({
        page:        { padding: 30, fontSize: 9, fontFamily: 'Helvetica' },
        header:      { marginBottom: 16, borderBottom: 1, borderBottomColor: '#0f766e', paddingBottom: 8 },
        title:       { fontSize: 16, fontWeight: 'bold', color: '#0f766e' },
        subtitle:    { fontSize: 10, color: '#475569', marginTop: 2 },
        kpis:        { flexDirection: 'row', gap: 8, marginBottom: 12 },
        kpi:         { flex: 1, padding: 8, border: 1, borderColor: '#e2e8f0', borderRadius: 4 },
        kpiLabel:    { fontSize: 8, color: '#64748b', marginBottom: 2 },
        kpiValue:    { fontSize: 12, fontWeight: 'bold' },
        sectionTitle:{ fontSize: 10, fontWeight: 'bold', marginBottom: 6, marginTop: 8, color: '#1e293b' },
        table:       { display: 'flex', flexDirection: 'column' },
        tableRow:    { flexDirection: 'row', borderBottom: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 3 },
        tableHeader: { flexDirection: 'row', borderBottom: 1, borderBottomColor: '#0f766e', paddingVertical: 4, backgroundColor: '#f0fdfa' },
        cellSm:      { width: '8%' },
        cellMd:      { width: '14%' },
        cellLg:      { width: '20%' },
        cellAmount:  { width: '14%', textAlign: 'right' },
        bold:        { fontWeight: 'bold' },
        green:       { color: '#059669' },
        red:         { color: '#dc2626' },
        footer:      { position: 'absolute', bottom: 20, left: 30, right: 30, fontSize: 8, color: '#94a3b8', textAlign: 'center' },
      })

      const Doc = (
        <Document>
          <Page size="A4" orientation="landscape" style={styles.page}>
            <View style={styles.header}>
              <Text style={styles.title}>{clinicName} — Relatório de Caixa</Text>
              <Text style={styles.subtitle}>Período: {periodLabel} · Total de lançamentos: {data.totals.count}</Text>
            </View>

            <View style={styles.kpis}>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Entradas</Text>
                <Text style={[styles.kpiValue, styles.green]}>{fmt(data.totals.inflows)}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Saídas</Text>
                <Text style={[styles.kpiValue, styles.red]}>{fmt(data.totals.outflows)}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Saldo</Text>
                <Text style={[styles.kpiValue, data.totals.balance >= 0 ? styles.green : styles.red]}>
                  {fmt(data.totals.balance)}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Lançamentos</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.cellSm, styles.bold]}>Tipo</Text>
                <Text style={[styles.cellMd, styles.bold]}>Data</Text>
                <Text style={[styles.cellMd, styles.bold]}>Módulo</Text>
                <Text style={[styles.cellLg, styles.bold]}>Pet/Fornecedor</Text>
                <Text style={[styles.cellMd, styles.bold]}>Tutor</Text>
                <Text style={[styles.cellSm, styles.bold]}>Forma</Text>
                <Text style={[styles.cellSm, styles.bold]}>Status</Text>
                <Text style={[styles.cellAmount, styles.bold]}>Valor</Text>
              </View>
              {data.rows.slice(0, 1500).map((r, i) => (
                <View key={r.entry_id || i} style={styles.tableRow}>
                  <Text style={styles.cellSm}>{r.entry_type === 'inflow' ? 'Entrada' : 'Saída'}</Text>
                  <Text style={styles.cellMd}>{fmtDate(r.occurred_at)}</Text>
                  <Text style={styles.cellMd}>{MODULE_LABELS[r.source_module] ?? r.source_module}</Text>
                  <Text style={styles.cellLg}>{r.patient_name || r.supplier_name || r.description || '—'}</Text>
                  <Text style={styles.cellMd}>{r.tutor_name || '—'}</Text>
                  <Text style={styles.cellSm}>
                    {r.payment_method ? (PAYMENT_LABELS[r.payment_method] ?? r.payment_method) : '—'}
                  </Text>
                  <Text style={styles.cellSm}>{r.status}</Text>
                  <Text style={[
                    styles.cellAmount,
                    r.entry_type === 'inflow' ? styles.green : styles.red,
                  ]}>
                    {r.entry_type === 'inflow' ? '+' : '−'} {fmt(Math.abs(Number(r.amount)))}
                  </Text>
                </View>
              ))}
            </View>

            {data.rows.length > 1500 && (
              <Text style={{ fontSize: 8, color: '#dc2626', marginTop: 8 }}>
                ⚠ PDF limitado a 1500 lançamentos. Use CSV para o conjunto completo ({data.rows.length} linhas).
              </Text>
            )}

            <Text style={styles.footer} render={({ pageNumber, totalPages }) => (
              `${clinicName} · Gerado em ${new Date().toLocaleString('pt-BR')} · Página ${pageNumber} de ${totalPages}`
            )} fixed />
          </Page>
        </Document>
      )

      const blob = await pdf(Doc).toBlob()
      downloadBlob(blob, `caixa-relatorio-${periodLabel.replace(/\//g, '-')}.pdf`)
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
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
      >
        <FileDown className="h-3.5 w-3.5" />
        Exportar CSV
      </button>
      <button
        type="button"
        onClick={handlePdf}
        disabled={data.rows.length === 0 || loadingPdf}
        className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50 transition-colors"
      >
        {loadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        Exportar PDF
      </button>
    </div>
  )
}
