import 'server-only'

/**
 * Extrato do Cliente em PDF — o documento que a Ana Lucia entrega/envia.
 *
 * POR QUE @react-pdf/renderer E NÃO `window.print()`:
 * os outros 19 relatórios imprimem pelo navegador, e para ver na tela isso
 * basta. Aqui o pedido é outro — "entregar para o meu cliente, enviar um PDF
 * para ele". Isso exige um ARQUIVO no servidor: o `window.print()` só abre a
 * caixa de diálogo do navegador, não produz bytes que o servidor possa anexar
 * a um WhatsApp ou a um e-mail, e o resultado depende de margem, zoom e
 * cabeçalho do navegador de quem clicou. Este caminho gera um PDF vetorial
 * idêntico em qualquer máquina, guardado no Storage, com URL assinada — é o
 * mesmo padrão já usado pelo Orçamento (src/lib/billing/render-quotation-pdf.tsx).
 * A impressão pelo navegador continua disponível na tela, para quem só quer
 * papel na hora.
 */

import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import {
  settledByLabel, daysOverdue,
  type ClientStatementResult, type StatementRow,
} from '@/lib/reports/client-statement-logic'

const BRL = (v: number) =>
  `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtBR = (iso: string | null): string => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : '—'
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', credit: 'Crédito', debit: 'Débito',
  credit_card: 'Crédito', debit_card: 'Débito', convenio: 'Convênio',
  boleto: 'Boleto', transfer: 'Transferência', credit_balance: 'Crédito do cliente',
  courtesy: 'Cortesia', other: 'Outros',
}
const payLabel = (m: string | null): string => (m ? (PAYMENT_LABEL[m] ?? m) : '—')

const net = (r: StatementRow): number => Number(r.amount ?? 0) - Number(r.discount ?? 0)

const styles = StyleSheet.create({
  page:        { paddingTop: 28, paddingBottom: 46, paddingHorizontal: 34, fontSize: 9, fontFamily: 'Helvetica', color: '#1e293b' },
  printStamp:  { position: 'absolute', top: 12, right: 34, fontSize: 7, color: '#94a3b8' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 2, borderBottomColor: '#16a34a', paddingBottom: 8, marginBottom: 10 },
  headerLeft:  { flexDirection: 'row', alignItems: 'flex-start' },
  logo:        { width: 54, height: 54, objectFit: 'contain', marginRight: 10 },
  clinicName:  { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  clinicMeta:  { fontSize: 8, color: '#475569', marginTop: 2 },
  docBadge:    { alignItems: 'flex-end' },
  docType:     { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#16a34a' },
  docDate:     { fontSize: 8, color: '#64748b', marginTop: 2 },

  section:     { marginBottom: 9, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, padding: 8 },
  sectionTitle:{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#16a34a', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  row:         { flexDirection: 'row', flexWrap: 'wrap' },
  field:       { width: '50%', marginBottom: 2, flexDirection: 'row' },
  label:       { fontFamily: 'Helvetica-Bold', color: '#475569' },
  value:       { color: '#0f172a' },

  cards:       { flexDirection: 'row', marginBottom: 10 },
  card:        { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, padding: 8, marginRight: 6 },
  cardLast:    { marginRight: 0 },
  cardLabel:   { fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  cardValue:   { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  cardMeta:    { fontSize: 7, color: '#94a3b8', marginTop: 2 },
  green:       { color: '#16a34a' },
  amber:       { color: '#b45309' },
  red:         { color: '#b91c1c' },
  slate:       { color: '#0f172a' },

  blockTitle:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginTop: 4, marginBottom: 4 },
  tHead:       { flexDirection: 'row', backgroundColor: '#16a34a', color: '#ffffff', paddingVertical: 4, paddingHorizontal: 4, fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  tHeadAmber:  { backgroundColor: '#b45309' },
  tRow:        { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 3.5, paddingHorizontal: 4, fontSize: 8 },
  tRowAlt:     { backgroundColor: '#f8fafc' },
  tFoot:       { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: '#cbd5e1', fontFamily: 'Helvetica-Bold', fontSize: 8 },

  cDate:       { width: '11%' },
  cDoc:        { width: '13%' },
  cDesc:       { width: '27%' },
  cPet:        { width: '11%' },
  cCompany:    { width: '13%' },
  cWho:        { width: '14%' },
  cValue:      { width: '11%', textAlign: 'right' },
  // colunas do bloco "em aberto" (sem operador, com atraso)
  oDesc:       { width: '33%' },
  oWho:        { width: '12%', textAlign: 'center' },

  empty:       { fontSize: 8, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 6, paddingHorizontal: 4 },
  note:        { fontSize: 7, color: '#94a3b8', marginTop: 3 },
  balanceBar:  { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  balanceBox:  { backgroundColor: '#0f172a', color: '#ffffff', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 4, alignItems: 'flex-end' },
  balanceLabel:{ fontSize: 8, color: '#cbd5e1' },
  balanceValue:{ fontSize: 14, fontFamily: 'Helvetica-Bold' },

  footer:      { position: 'absolute', bottom: 18, left: 34, right: 34, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:  { fontSize: 7, color: '#94a3b8' },
  footerBrand: { fontSize: 7, color: '#16a34a', fontFamily: 'Helvetica-Bold' },
})

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}: </Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  )
}

function clinicAddress(c: ClientStatementResult['clinic']): string {
  return [c.address, [c.city, c.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')
}

function StatementDocument({ data }: { data: ClientStatementResult }) {
  const { client, clinic, filters, summary, companies } = data
  const { totals } = summary
  const printedAt = new Date().toLocaleString('pt-BR')
  const periodo = `${fmtBR(filters.from)} a ${fmtBR(filters.to)}`
  const companyFilter = filters.company_id
    ? (companies.find(c => c.id === filters.company_id)?.name ?? 'Empresa selecionada')
    : 'Todas as empresas'
  const multiCompany = summary.byCompany.length > 1

  return (
    <Document title={`Extrato · ${client.name}`}>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.printStamp} fixed>Emitido em {printedAt}</Text>

        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {clinic.logo_url ? <Image style={styles.logo} src={clinic.logo_url} /> : null}
            <View>
              <Text style={styles.clinicName}>{clinic.name}</Text>
              {clinic.cnpj  ? <Text style={styles.clinicMeta}>CNPJ {clinic.cnpj}</Text> : null}
              {clinic.phone ? <Text style={styles.clinicMeta}>{clinic.phone}</Text> : null}
              <Text style={styles.clinicMeta}>{clinicAddress(clinic)}</Text>
            </View>
          </View>
          <View style={styles.docBadge}>
            <Text style={styles.docType}>EXTRATO DO CLIENTE</Text>
            <Text style={styles.docDate}>Período: {periodo}</Text>
            <Text style={styles.docDate}>Posição em {fmtBR(filters.as_of)}</Text>
          </View>
        </View>

        {/* Identificação — o cliente precisa se reconhecer no documento */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {client.kind === 'tutor' ? 'Tutor' : 'Clínica parceira / protetor'}
          </Text>
          <View style={styles.row}>
            <Field label="Nome"  value={client.name} />
            <Field label={client.kind === 'tutor' ? 'CPF' : 'CNPJ'} value={client.document} />
            <Field label="Telefone" value={client.phone} />
            <Field label="E-mail"   value={client.email} />
          </View>
        </View>

        {/* Filtros aplicados — impresso de propósito: o cliente tem que saber o
            recorte que gerou os números, senão o extrato não é auditável. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Filtros aplicados</Text>
          <View style={styles.row}>
            <Field label="Período"  value={periodo} />
            <Field label="Empresa"  value={companyFilter} />
          </View>
        </View>

        {/* Pago × a pagar, lado a lado (pedido da Bruna) */}
        <View style={styles.cards}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Pago no período</Text>
            <Text style={[styles.cardValue, styles.green]}>{BRL(totals.paid_total)}</Text>
            <Text style={styles.cardMeta}>{totals.paid_count} título(s)</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Em aberto</Text>
            <Text style={[styles.cardValue, styles.amber]}>{BRL(totals.pending_total)}</Text>
            <Text style={styles.cardMeta}>{totals.pending_count} título(s)</Text>
          </View>
          <View style={[styles.card, styles.cardLast]}>
            <Text style={styles.cardLabel}>Vencido</Text>
            <Text style={[styles.cardValue, totals.overdue_total > 0 ? styles.red : styles.slate]}>
              {BRL(totals.overdue_total)}
            </Text>
            <Text style={styles.cardMeta}>{totals.overdue_count} título(s)</Text>
          </View>
        </View>

        {/* Quebra por empresa faturante — a Animais opera 3 CNPJs */}
        {multiCompany ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Por empresa faturante</Text>
            <View style={styles.tHead}>
              <Text style={{ width: '58%' }}>Empresa</Text>
              <Text style={{ width: '21%', textAlign: 'right' }}>Pago</Text>
              <Text style={{ width: '21%', textAlign: 'right' }}>Em aberto</Text>
            </View>
            {summary.byCompany.map((c, i) => (
              <View key={c.company_id ?? 'none'} style={i % 2 ? [styles.tRow, styles.tRowAlt] : styles.tRow}>
                <Text style={{ width: '58%' }}>{c.company_name}</Text>
                <Text style={{ width: '21%', textAlign: 'right' }}>{BRL(c.paid_total)}</Text>
                <Text style={{ width: '21%', textAlign: 'right' }}>{BRL(c.pending_total)}</Text>
              </View>
            ))}
            <View style={styles.tFoot}>
              <Text style={{ width: '58%' }}>Total</Text>
              <Text style={{ width: '21%', textAlign: 'right' }}>{BRL(totals.paid_total)}</Text>
              <Text style={{ width: '21%', textAlign: 'right' }}>{BRL(totals.pending_total)}</Text>
            </View>
          </View>
        ) : null}

        {/* ── O que o cliente PAGOU ── */}
        <Text style={styles.blockTitle}>Pagamentos recebidos no período</Text>
        <View style={styles.tHead}>
          <Text style={styles.cDate}>Pago em</Text>
          <Text style={styles.cDoc}>Documento</Text>
          <Text style={styles.cDesc}>Descrição</Text>
          <Text style={styles.cPet}>Pet</Text>
          <Text style={styles.cCompany}>Empresa</Text>
          <Text style={styles.cWho}>Baixa por</Text>
          <Text style={styles.cValue}>Valor</Text>
        </View>
        {summary.paid.length === 0 ? (
          <Text style={styles.empty}>Nenhum pagamento no período.</Text>
        ) : summary.paid.map((r, i) => (
          <View key={r.id} style={i % 2 ? [styles.tRow, styles.tRowAlt] : styles.tRow} wrap={false}>
            <Text style={styles.cDate}>{fmtBR(r.payment_date)}</Text>
            <Text style={styles.cDoc}>{r.document_number ?? '—'}</Text>
            <Text style={styles.cDesc}>{r.description}</Text>
            <Text style={styles.cPet}>{r.patient_name ?? '—'}</Text>
            <Text style={styles.cCompany}>{r.company_name ?? '—'}</Text>
            <Text style={styles.cWho}>{settledByLabel(r.settled)}</Text>
            <Text style={styles.cValue}>{BRL(net(r))}</Text>
          </View>
        ))}
        {summary.paid.length > 0 ? (
          <View style={styles.tFoot}>
            <Text style={{ width: '89%' }}>Total pago · {payMethodsSummary(summary.paid)}</Text>
            <Text style={styles.cValue}>{BRL(totals.paid_total)}</Text>
          </View>
        ) : null}
        {data.has_unknown_settler ? (
          <Text style={styles.note}>
            "Não registrado" = baixa feita antes do registro de operador passar a ser gravado.
          </Text>
        ) : null}

        {/* ── O que o cliente TEM A PAGAR ── */}
        <Text style={styles.blockTitle}>Títulos em aberto</Text>
        <View style={[styles.tHead, styles.tHeadAmber]}>
          <Text style={styles.cDate}>Vencimento</Text>
          <Text style={styles.cDoc}>Documento</Text>
          <Text style={styles.oDesc}>Descrição</Text>
          <Text style={styles.cPet}>Pet</Text>
          <Text style={styles.cCompany}>Empresa</Text>
          <Text style={styles.oWho}>Atraso</Text>
          <Text style={styles.cValue}>Valor</Text>
        </View>
        {summary.pending.length === 0 ? (
          <Text style={styles.empty}>Nenhum título em aberto no período. </Text>
        ) : summary.pending.map((r, i) => {
          const atraso = daysOverdue(r.due_date, filters.as_of)
          return (
            <View key={r.id} style={i % 2 ? [styles.tRow, styles.tRowAlt] : styles.tRow} wrap={false}>
              <Text style={styles.cDate}>{fmtBR(r.due_date)}</Text>
              <Text style={styles.cDoc}>{r.document_number ?? '—'}</Text>
              <Text style={styles.oDesc}>{r.description}</Text>
              <Text style={styles.cPet}>{r.patient_name ?? '—'}</Text>
              <Text style={styles.cCompany}>{r.company_name ?? '—'}</Text>
              <Text style={[styles.oWho, atraso > 0 ? styles.red : styles.slate]}>
                {atraso > 0 ? `${atraso} d` : 'a vencer'}
              </Text>
              <Text style={styles.cValue}>{BRL(net(r))}</Text>
            </View>
          )
        })}
        {summary.pending.length > 0 ? (
          <View style={styles.tFoot}>
            <Text style={{ width: '89%' }}>Total em aberto</Text>
            <Text style={styles.cValue}>{BRL(totals.pending_total)}</Text>
          </View>
        ) : null}

        <View style={styles.balanceBar}>
          <View style={styles.balanceBox}>
            <Text style={styles.balanceLabel}>Saldo devedor em {fmtBR(filters.as_of)}</Text>
            <Text style={styles.balanceValue}>{BRL(totals.balance)}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {clinic.name} · Extrato do cliente {client.name} · {periodo}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Pág. ${pageNumber}/${totalPages}`}
          />
          <Text style={styles.footerBrand}>Desenvolvido por Sysmax Software</Text>
        </View>
      </Page>
    </Document>
  )
}

/** "PIX R$ 120,00 · Dinheiro R$ 80,00" — como o cliente pagou, no rodapé. */
function payMethodsSummary(rows: StatementRow[]): string {
  const by = new Map<string, number>()
  for (const r of rows) {
    const k = payLabel(r.payment_method)
    by.set(k, (by.get(k) ?? 0) + net(r))
  }
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${BRL(v)}`)
    .join(' · ')
}

export async function renderClientStatementPdfBuffer(data: ClientStatementResult): Promise<Buffer> {
  const buf = await renderToBuffer(<StatementDocument data={data} />)
  return buf as Buffer
}
